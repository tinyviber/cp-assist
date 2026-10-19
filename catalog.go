package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/sqlite"
)

const pageSize = 50

// Catalog is the bound data service. It imports
// cptrain/research/hard-problems-catalog/catalog_annotated.jsonl into a
// SQLite database in the app's user-data directory on first run (and when
// the file changes), then answers the frontend's paged queries from it.
//
// Bound methods run on IPC goroutines; *sqlite.DB serializes them, and the
// import holds an extra mutex so a re-import never races a query.
type Catalog struct {
	db *sqlite.DB

	mu        sync.Mutex
	ready     bool
	importing bool
	total     int64
	err       error
}

// Status is the import state the frontend polls on startup.
type Status struct {
	Ready     bool   `json:"ready"`
	Importing bool   `json:"importing"`
	Total     int64  `json:"total"`
	Error     string `json:"error,omitempty"`
}

// Problem is one catalog row as the list shows it.
type Problem struct {
	Key          string   `json:"key"`
	Platform     string   `json:"platform"`
	Pid          string   `json:"pid"`
	Title        string   `json:"title"`
	URL          string   `json:"url"`
	Contest      string   `json:"contest"`
	Year         int64    `json:"year"`
	Tier         string   `json:"tier"`
	RatingEst    *float64 `json:"ratingEst"` // normalized ≈CF estimate; nil = unrated
	Native       string   `json:"native"`    // the source's own difficulty label, never equated to CF
	Main         []string `json:"main"`      // tags_main: the 1-3 most fitting knowledge points
	Extra        []string `json:"extra"`     // knowledge minus main: weaker-confidence mentions
	AnnSource    string   `json:"annSource"` // annotation provenance
	PlatformTags []string `json:"tags"`      // the platform's own tags, verbatim
}

// SearchQuery is one paged, filtered list request.
type SearchQuery struct {
	Search   string `json:"search"`
	Platform string `json:"platform"`
	Tier     string `json:"tier"`
	KP       string `json:"kp"`   // algorithm knowledge point (non-tech.* code)
	Tech     string `json:"tech"` // thinking technique (tech.* code)
	Page     int    `json:"page"`
}

// Page is one page of search results.
type Page struct {
	Total int64     `json:"total"`
	Page  int       `json:"page"`
	Pages int       `json:"pages"`
	Items []Problem `json:"items"`
}

// Option is one filter choice with its row count.
type Option struct {
	ID    string `json:"id"`
	Count int64  `json:"count"`
}

// Filters lists the available filter values.
type Filters struct {
	Platforms []Option `json:"platforms"`
	Tiers     []Option `json:"tiers"`
	KP        []Option `json:"kp"`   // knowledge-point codes, minus tech.*
	Tech      []Option `json:"tech"` // tech.* codes
}

// Review is one saved retrospective note.
type Review struct {
	ID      int64    `json:"id"`
	Title   string   `json:"title"`
	Causes  []string `json:"causes"`
	Note    string   `json:"note"`
	Created int64    `json:"created"`
}

// ReviewStats summarizes the saved reviews.
type ReviewStats struct {
	Total     int64    `json:"total"`
	TopCauses []Option `json:"topCauses"`
}

// open creates the database and schema. Called from WhenReady: Bind needs a
// *Catalog before Run so `mygo generate` can see its methods.
func (c *Catalog) open() error {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	db, err := sqlite.Open(context.Background(), filepath.Join(dir, "catalog.db"), sqlite.OpenOptions{})
	if err != nil {
		return err
	}
	c.db = db
	stmts := []sqlite.Statement{
		{SQL: `CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)`},
		{SQL: `CREATE TABLE IF NOT EXISTS problems(
			key TEXT PRIMARY KEY, platform TEXT NOT NULL, pid TEXT,
			title TEXT NOT NULL, url TEXT, contest TEXT, year INTEGER,
			tier TEXT, rating_est REAL, difficulty_json TEXT,
			tags_json TEXT, ann_source TEXT)`},
		{SQL: `CREATE TABLE IF NOT EXISTS problem_kp(
			key TEXT NOT NULL REFERENCES problems(key) ON DELETE CASCADE,
			code TEXT NOT NULL, main INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (key, code))`},
		{SQL: `CREATE INDEX IF NOT EXISTS idx_problems_platform ON problems(platform)`},
		{SQL: `CREATE INDEX IF NOT EXISTS idx_problems_tier ON problems(tier)`},
		{SQL: `CREATE INDEX IF NOT EXISTS idx_problems_est ON problems(rating_est)`},
		{SQL: `CREATE INDEX IF NOT EXISTS idx_kp_code ON problem_kp(code)`},
		{SQL: `CREATE TABLE IF NOT EXISTS reviews(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL, causes_json TEXT NOT NULL DEFAULT '[]',
			note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)`},
		{SQL: `PRAGMA journal_mode=WAL`},
	}
	if _, err := c.db.Transaction(context.Background(), stmts); err != nil {
		db.Close()
		return err
	}
	return nil
}

// Status reports whether the catalog is imported and queryable.
func (c *Catalog) Status() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	s := Status{Ready: c.ready, Importing: c.importing, Total: c.total}
	if c.err != nil {
		s.Error = c.err.Error()
	}
	return s
}

// catalogDir locates research/hard-problems-catalog inside the cptrain
// checkout: $CPTRAIN_CATALOG first, then the usual repo locations.
func catalogDir() (string, error) {
	var cands []string
	if v := os.Getenv("CPTRAIN_CATALOG"); v != "" {
		cands = append(cands, v)
	}
	if wd, err := os.Getwd(); err == nil {
		cands = append(cands, filepath.Join(wd, "..", "tinyviber-cptrain", "research", "hard-problems-catalog"))
	}
	if home, err := os.UserHomeDir(); err == nil {
		cands = append(cands, filepath.Join(home, "Documents", "repos", "tinyviber-cptrain", "research", "hard-problems-catalog"))
	}
	for _, dir := range cands {
		if st, err := os.Stat(filepath.Join(dir, "catalog_annotated.jsonl")); err == nil && st.Mode().IsRegular() {
			return dir, nil
		}
	}
	return "", errors.New("catalog: hard-problems-catalog not found (set CPTRAIN_CATALOG)")
}

// importIfNeeded imports the catalog when its file signature changed.
func (c *Catalog) importIfNeeded() {
	dir, err := catalogDir()
	if err != nil {
		c.setErr(err)
		return
	}
	file := filepath.Join(dir, "catalog_annotated.jsonl")
	st, err := os.Stat(file)
	if err != nil {
		c.setErr(err)
		return
	}
	sig := fmt.Sprintf("%d:%d", st.Size(), st.ModTime().UnixNano())
	if got := c.meta("import_sig"); got == sig {
		c.mu.Lock()
		c.ready, c.total = true, c.count()
		c.mu.Unlock()
		return
	}
	c.mu.Lock()
	c.importing = true
	c.mu.Unlock()
	go func() {
		err := c.importAll(file)
		c.mu.Lock()
		defer c.mu.Unlock()
		c.importing = false
		if err != nil {
			c.err = err
			return
		}
		c.err = nil
		c.ready = true
		c.total = c.count()
		if _, err := c.db.Execute(context.Background(), `INSERT OR REPLACE INTO meta(k,v) VALUES('import_sig',?)`, sig); err != nil {
			c.err = err
		}
	}()
}

func (c *Catalog) setErr(err error) {
	c.mu.Lock()
	c.err = err
	c.mu.Unlock()
}

func (c *Catalog) meta(k string) string {
	rows, err := c.db.Query(context.Background(), `SELECT v FROM meta WHERE k=?`, k)
	if err != nil || len(rows.Values) == 0 {
		return ""
	}
	return text(rows.Values[0][0])
}

func (c *Catalog) count() int64 {
	rows, err := c.db.Query(context.Background(), `SELECT COUNT(*) FROM problems`)
	if err != nil || len(rows.Values) == 0 {
		return 0
	}
	return num(rows.Values[0][0])
}

type catalogRow struct {
	Key        string         `json:"key"`
	Platform   string         `json:"platform"`
	Pid        string         `json:"pid"`
	Title      string         `json:"title"`
	URL        string         `json:"url"`
	Contest    string         `json:"contest"`
	Year       *int64         `json:"year"`
	Difficulty map[string]any `json:"difficulty"`
	RatingEst  *float64       `json:"rating_est"`
	Tags       []string       `json:"tags"`
	Tier       string         `json:"tier"`
	TagsMain   []string       `json:"tags_main"`
	Knowledge  []string       `json:"knowledge"`
	AnnSource  string         `json:"ann_source"`
}

func (c *Catalog) importAll(file string) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()

	ctx := context.Background()
	if _, err := c.db.Transaction(ctx, []sqlite.Statement{
		{SQL: `DELETE FROM problem_kp`},
		{SQL: `DELETE FROM problems`},
	}); err != nil {
		return err
	}

	const ins = `INSERT INTO problems
		(key,platform,pid,title,url,contest,year,tier,rating_est,difficulty_json,tags_json,ann_source)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
	const insKP = `INSERT OR IGNORE INTO problem_kp(key,code,main) VALUES(?,?,?)`

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), 8<<20)
	var batch []sqlite.Statement
	var n int64
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		_, err := c.db.Transaction(ctx, batch)
		batch = batch[:0]
		c.mu.Lock()
		c.total = n
		c.mu.Unlock()
		return err
	}
	for sc.Scan() {
		var r catalogRow
		if err := json.Unmarshal(sc.Bytes(), &r); err != nil || r.Key == "" || r.Title == "" {
			continue
		}
		diffJSON, _ := json.Marshal(r.Difficulty)
		tagsJSON, _ := json.Marshal(r.Tags)
		var year any
		if r.Year != nil {
			year = *r.Year
		}
		var est any
		if r.RatingEst != nil {
			est = *r.RatingEst
		}
		batch = append(batch, sqlite.Statement{SQL: ins, Args: []any{
			r.Key, r.Platform, r.Pid, r.Title, r.URL, r.Contest, year, r.Tier,
			est, string(diffJSON), string(tagsJSON), r.AnnSource,
		}})
		main := map[string]bool{}
		for _, code := range r.TagsMain {
			main[code] = true
		}
		seen := map[string]bool{}
		for _, code := range append(r.TagsMain, r.Knowledge...) {
			if code == "" || seen[code] {
				continue
			}
			seen[code] = true
			m := 0
			if main[code] {
				m = 1
			}
			batch = append(batch, sqlite.Statement{SQL: insKP, Args: []any{r.Key, code, m}})
		}
		n++
		if len(batch) >= 4000 {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	return flush()
}

// Search runs a filtered, paged query. All inputs are bound parameters.
func (c *Catalog) Search(q SearchQuery) (Page, error) {
	if err := c.guard(); err != nil {
		return Page{}, err
	}
	var where []string
	var args []any
	if s := strings.TrimSpace(q.Search); s != "" {
		like := "%" + escapeLike(s) + "%"
		where = append(where, `(p.title LIKE ? ESCAPE '\' OR p.key LIKE ? ESCAPE '\' OR IFNULL(p.contest,'') LIKE ? ESCAPE '\')`)
		args = append(args, like, like, like)
	}
	if q.Platform != "" {
		where = append(where, `p.platform=?`)
		args = append(args, q.Platform)
	}
	if q.Tier != "" {
		where = append(where, `p.tier=?`)
		args = append(args, q.Tier)
	}
	for _, code := range []string{q.KP, q.Tech} {
		if code == "" {
			continue
		}
		where = append(where, `EXISTS(SELECT 1 FROM problem_kp k WHERE k.key=p.key AND (k.code=? OR k.code LIKE ?))`)
		args = append(args, code, code+".%")
	}
	cond := "1"
	if len(where) > 0 {
		cond = strings.Join(where, " AND ")
	}
	ctx := context.Background()
	var total int64
	if rows, err := c.db.Query(ctx, `SELECT COUNT(*) FROM problems p WHERE `+cond, args...); err != nil {
		return Page{}, err
	} else if len(rows.Values) > 0 {
		total = num(rows.Values[0][0])
	}
	pages := int((total + pageSize - 1) / pageSize)
	page := min(max(q.Page, 0), max(pages-1, 0))
	rows, err := c.db.Query(ctx, `SELECT p.key,p.platform,p.pid,p.title,p.url,IFNULL(p.contest,''),
		IFNULL(p.year,0),p.tier,p.rating_est,p.difficulty_json,p.tags_json,IFNULL(p.ann_source,'')
		FROM problems p WHERE `+cond+`
		ORDER BY p.rating_est IS NULL, p.rating_est DESC, p.year DESC, p.key
		LIMIT ? OFFSET ?`, append(args, pageSize, page*pageSize)...)
	if err != nil {
		return Page{}, err
	}
	keys := make([]string, 0, len(rows.Values))
	items := make([]Problem, 0, len(rows.Values))
	for _, v := range rows.Values {
		p := Problem{
			Key:       text(v[0]),
			Platform:  text(v[1]),
			Pid:       text(v[2]),
			Title:     text(v[3]),
			URL:       text(v[4]),
			Contest:   text(v[5]),
			Year:      num(v[6]),
			Tier:      text(v[7]),
			Native:    nativeLabel(text(v[9])),
			AnnSource: text(v[11]),
		}
		if e := v[8]; e != nil {
			f := float(e)
			p.RatingEst = &f
		}
		json.Unmarshal([]byte(text(v[10])), &p.PlatformTags)
		keys = append(keys, p.Key)
		items = append(items, p)
	}
	if err := c.fillKP(ctx, keys, items); err != nil {
		return Page{}, err
	}
	return Page{Total: total, Page: page, Pages: pages, Items: items}, nil
}

// fillKP attaches each item's main and auxiliary knowledge-point codes.
func (c *Catalog) fillKP(ctx context.Context, keys []string, items []Problem) error {
	if len(items) == 0 {
		return nil
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(keys)), ",")
	args := make([]any, len(keys))
	for i, k := range keys {
		args[i] = k
	}
	rows, err := c.db.Query(ctx, `SELECT key, code, main FROM problem_kp WHERE key IN (`+marks+`)`, args...)
	if err != nil {
		return err
	}
	byKey := map[string]*Problem{}
	for i := range items {
		byKey[items[i].Key] = &items[i]
	}
	for _, v := range rows.Values {
		p := byKey[text(v[0])]
		if p == nil {
			continue
		}
		if num(v[2]) == 1 {
			p.Main = append(p.Main, text(v[1]))
		} else {
			p.Extra = append(p.Extra, text(v[1]))
		}
	}
	return nil
}

// Today returns a small queue for the training page: a few problems around
// the 省选/NOI band, re-picked on each launch.
func (c *Catalog) Today() ([]Problem, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	ctx := context.Background()
	rows, err := c.db.Query(ctx, `SELECT p.key,p.platform,p.pid,p.title,p.url,IFNULL(p.contest,''),
		IFNULL(p.year,0),p.tier,p.rating_est,p.difficulty_json,p.tags_json,IFNULL(p.ann_source,'')
		FROM problems p WHERE p.tier IN ('prov','noi') AND p.rating_est IS NOT NULL
		ORDER BY RANDOM() LIMIT 3`)
	if err != nil {
		return nil, err
	}
	var keys []string
	var items []Problem
	for _, v := range rows.Values {
		p := Problem{Key: text(v[0]), Platform: text(v[1]), Pid: text(v[2]), Title: text(v[3]),
			URL: text(v[4]), Contest: text(v[5]), Year: num(v[6]), Tier: text(v[7]),
			Native: nativeLabel(text(v[9])), AnnSource: text(v[11])}
		if e := v[8]; e != nil {
			f := float(e)
			p.RatingEst = &f
		}
		json.Unmarshal([]byte(text(v[10])), &p.PlatformTags)
		keys = append(keys, p.Key)
		items = append(items, p)
	}
	if err := c.fillKP(ctx, keys, items); err != nil {
		return nil, err
	}
	return items, nil
}

// Filters lists platforms, tiers and knowledge-point codes with counts.
func (c *Catalog) Filters() (Filters, error) {
	if err := c.guard(); err != nil {
		return Filters{}, err
	}
	ctx := context.Background()
	var f Filters
	if err := c.options(ctx, `SELECT platform, COUNT(*) FROM problems GROUP BY platform ORDER BY 2 DESC, 1`, &f.Platforms); err != nil {
		return f, err
	}
	if err := c.options(ctx, `SELECT tier, COUNT(*) FROM problems GROUP BY tier ORDER BY 2 DESC`, &f.Tiers); err != nil {
		return f, err
	}
	rows, err := c.db.Query(ctx, `SELECT code, COUNT(*) FROM problem_kp GROUP BY code ORDER BY 2 DESC, 1`)
	if err != nil {
		return f, err
	}
	for _, v := range rows.Values {
		o := Option{ID: text(v[0]), Count: num(v[1])}
		if o.ID == "tech" || strings.HasPrefix(o.ID, "tech.") {
			f.Tech = append(f.Tech, o)
		} else {
			f.KP = append(f.KP, o)
		}
	}
	return f, nil
}

func (c *Catalog) options(ctx context.Context, sql string, out *[]Option) error {
	rows, err := c.db.Query(ctx, sql)
	if err != nil {
		return err
	}
	for _, v := range rows.Values {
		*out = append(*out, Option{ID: text(v[0]), Count: num(v[1])})
	}
	return nil
}

// dbErr reports database unavailability without blocking on the catalog
// import: notes work even while problems are still being imported.
func (c *Catalog) dbErr() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.db == nil {
		if c.err != nil {
			return c.err
		}
		return errors.New("catalog: 数据库未打开")
	}
	return nil
}

// AddReview saves a retrospective note. Fields are capped on the server.
func (c *Catalog) AddReview(r Review) (int64, error) {
	if err := c.dbErr(); err != nil {
		return 0, err
	}
	title := strings.TrimSpace(r.Title)
	if title == "" {
		return 0, errors.New("标题不能为空")
	}
	title = truncateRunes(title, 120)
	note := truncateRunes(r.Note, 4000)
	var causes []string
	for _, s := range r.Causes {
		if s = truncateRunes(strings.TrimSpace(s), 24); s != "" {
			causes = append(causes, s)
		}
	}
	if len(causes) > 8 {
		causes = causes[:8]
	}
	causesJSON, _ := json.Marshal(causes)
	res, err := c.db.Execute(context.Background(),
		`INSERT INTO reviews(title,causes_json,note,created) VALUES(?,?,?,?)`,
		title, string(causesJSON), note, unixNow())
	if err != nil {
		return 0, err
	}
	return res.LastInsertID, nil
}

// Reviews lists saved notes, newest first.
func (c *Catalog) Reviews() ([]Review, error) {
	if err := c.dbErr(); err != nil {
		return nil, err
	}
	rows, err := c.db.Query(context.Background(),
		`SELECT id,title,causes_json,note,created FROM reviews ORDER BY created DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	out := make([]Review, 0, len(rows.Values))
	for _, v := range rows.Values {
		r := Review{ID: num(v[0]), Title: text(v[1]), Note: text(v[3]), Created: num(v[4])}
		json.Unmarshal([]byte(text(v[2])), &r.Causes)
		out = append(out, r)
	}
	return out, nil
}

// DeleteReview removes one saved note.
func (c *Catalog) DeleteReview(id int64) error {
	if err := c.dbErr(); err != nil {
		return err
	}
	_, err := c.db.Execute(context.Background(), `DELETE FROM reviews WHERE id=?`, id)
	return err
}

// ReviewStats counts reviews and how often each cause was chosen.
func (c *Catalog) ReviewStats() (ReviewStats, error) {
	var s ReviewStats
	if err := c.dbErr(); err != nil {
		return s, err
	}
	rows, err := c.db.Query(context.Background(), `SELECT causes_json FROM reviews`)
	if err != nil {
		return s, err
	}
	counts := map[string]int64{}
	for _, v := range rows.Values {
		var causes []string
		json.Unmarshal([]byte(text(v[0])), &causes)
		s.Total++
		for _, c := range causes {
			counts[c]++
		}
	}
	for name, n := range counts {
		s.TopCauses = append(s.TopCauses, Option{ID: name, Count: n})
	}
	for i := 0; i < len(s.TopCauses); i++ {
		for j := i + 1; j < len(s.TopCauses); j++ {
			if s.TopCauses[j].Count > s.TopCauses[i].Count ||
				(s.TopCauses[j].Count == s.TopCauses[i].Count && s.TopCauses[j].ID < s.TopCauses[i].ID) {
				s.TopCauses[i], s.TopCauses[j] = s.TopCauses[j], s.TopCauses[i]
			}
		}
	}
	if len(s.TopCauses) > 5 {
		s.TopCauses = s.TopCauses[:5]
	}
	return s, nil
}

func (c *Catalog) guard() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.err != nil {
		return c.err
	}
	if !c.ready {
		return errors.New("题库还在导入中")
	}
	return nil
}

/* ---- helpers ---- */

func text(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case []byte:
		return string(x)
	default:
		return fmt.Sprint(v)
	}
}

func num(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	default:
		return 0
	}
}

func float(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int64:
		return float64(x)
	default:
		return 0
	}
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func unixNow() int64 { return time.Now().Unix() }

// nativeLabel renders the platform's own difficulty as a short tag. Ratings
// from different platforms are not equated — the estimate stays separate.
func nativeLabel(diffJSON string) string {
	if diffJSON == "" {
		return ""
	}
	var d map[string]any
	if json.Unmarshal([]byte(diffJSON), &d) != nil {
		return ""
	}
	switch {
	case d["cf_rating"] != nil:
		return fmt.Sprintf("CF %d", int(float(d["cf_rating"])))
	case d["at_difficulty"] != nil:
		l := fmt.Sprintf("AT %d", int(float(d["at_difficulty"])))
		if d["experimental"] == true {
			l += "≈"
		}
		return l
	case d["luogu_d"] != nil:
		if s, ok := d["luogu"].(string); ok && s != "" {
			return "洛谷 " + s
		}
		return fmt.Sprintf("洛谷 d%v", d["luogu_d"])
	case d["dmoj_points"] != nil:
		return fmt.Sprintf("DMOJ %gp", float(d["dmoj_points"]))
	case d["kattis_difficulty"] != nil:
		return fmt.Sprintf("Kattis %.1f", float(d["kattis_difficulty"]))
	default:
		return "" // source-backed rows: no numeric difficulty
	}
}
