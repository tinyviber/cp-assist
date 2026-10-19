package main

import (
	"log"

	"github.com/egoist/mygo"
)

func main() {
	catalog := &Catalog{}
	mygo.Bind(catalog)

	mygo.App.WhenReady(func() {
		if err := catalog.open(); err != nil {
			log.Printf("catalog: %v", err)
			catalog.setErr(err)
		} else {
			catalog.importIfNeeded()
		}

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
