package main

import (
	"log"
	"net/http"
)

func main() {
	// 1. Create a new HTTP router
	mux := http.NewServeMux()

	// 2. Serve the compiled Vite assets (CSS & JS)
	// Vite will ask for files like "/assets/index-abc.js"
	// This tells Go to look inside the "./frontend/dist" folder for them.
	mux.Handle("/assets/", http.FileServer(http.Dir("./frontend/dist")))

	// 3. Serve the main camera interface on the root path "/"
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If the user requests a page that doesn't exist (like /nonsense),
		// we still just serve the camera app (Single Page App behavior).
		http.ServeFile(w, r, "./frontend/dist/index.html")
	})

	// 4. Start the server
	port := ":8080"
	log.Printf("Camera server starting on http://localhost%s\n", port)

	err := http.ListenAndServe(port, mux)
	if err != nil {
		log.Fatal(err)
	}
}
