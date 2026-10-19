package main

import (
	"log"
	"runtime"

	"github.com/egoist/mygo"
)

// App is callable from the frontend: `mygo generate` turns its methods
// into typed TypeScript functions in src/mygo.ts.
type App struct{}

// Info describes the app and the machine it runs on.
type Info struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	GoVersion string `json:"goVersion"`
	Version   string `json:"version"`
}

// Info returns information about the app and the system.
func (App) Info() Info {
	return Info{
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		GoVersion: runtime.Version(),
		Version:   "0.1.0",
	}
}

func main() {
	mygo.Bind(App{})

	mygo.App.WhenReady(func() {
		mygo.NewWindow(mygo.WindowOptions{
			Title:         "CP Assist",
			Width:         1160,
			Height:        740,
			MinWidth:      880,
			MinHeight:     560,
			TitleBarStyle: mygo.TitleBarHidden,
			// Center the traffic lights in the 50px strip the page
			// draws at the top (see .rail-top/.topbar in style.css).
			TrafficLightPosition: &mygo.Point{X: 14, Y: 19},
			// --bg of src/theme/tokens.css in light and dark.
			BackgroundColor: "light-dark(#f4f4f6, #1a1a1e)",
			// Opens where the user left it last time.
			StateKey: "main",
			// The frontend: devUrl during `mygo dev`, frontendDist
			// embedded by `mygo build` otherwise (see mygo.config.ts).
			URL: "/",
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
