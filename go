flag provided but not defined: -json
flag provided but not defined: -json
Usage of 'go tool cover':
Given a coverage profile produced by 'go test':
	go test -coverprofile=c.out

Open a web browser displaying annotated source code:
	go tool cover -html=c.out

Write out an HTML file instead of launching a web browser:
	go tool cover -html=c.out -o coverage.html

Display coverage percentages to stdout for each function:
	go tool cover -func=c.out

Finally, to generate modified source code with coverage annotations
for a package (what go test -cover does):
	go tool cover -mode=set -var=CoverageVariableName \
		-pkgcfg=<config> -outfilelist=<file> file1.go ... fileN.go

where -pkgcfg points to a file containing the package path,
package name, module path, and related info from "go build",
and -outfilelist points to a file containing the filenames
of the instrumented output files (one per input file).
See https://pkg.go.dev/cmd/internal/cov/covcmd#CoverPkgConfig for
more on the package config.

Flags:
  -V	print version and exit
  -func string
    	output coverage profile information for each function
  -html string
    	generate HTML representation of coverage profile
  -mode string
    	coverage mode: set, count, atomic
  -o string
    	file for output
  -outfilelist string
    	file containing list of output files (one per line) if -pkgcfg is in use
  -pkgcfg string
    	enable full-package instrumentation mode using params from specified config file
  -var string
    	name of coverage variable to generate (default "GoCover")

  Only one of -html, -func, or -mode may be set.
Usage of 'go tool cover':
Given a coverage profile produced by 'go test':
	go test -coverprofile=c.out

Open a web browser displaying annotated source code:
	go tool cover -html=c.out

Write out an HTML file instead of launching a web browser:
	go tool cover -html=c.out -o coverage.html

Display coverage percentages to stdout for each function:
	go tool cover -func=c.out

Finally, to generate modified source code with coverage annotations
for a package (what go test -cover does):
	go tool cover -mode=set -var=CoverageVariableName \
		-pkgcfg=<config> -outfilelist=<file> file1.go ... fileN.go

where -pkgcfg points to a file containing the package path,
package name, module path, and related info from "go build",
and -outfilelist points to a file containing the filenames
of the instrumented output files (one per input file).
See https://pkg.go.dev/cmd/internal/cov/covcmd#CoverPkgConfig for
more on the package config.

Flags:
  -V	print version and exit
  -func string
    	output coverage profile information for each function
  -html string
    	generate HTML representation of coverage profile
  -mode string
    	coverage mode: set, count, atomic
  -o string
    	file for output
  -outfilelist string
    	file containing list of output files (one per line) if -pkgcfg is in use
  -pkgcfg string
    	enable full-package instrumentation mode using params from specified config file
  -var string
    	name of coverage variable to generate (default "GoCover")

  Only one of -html, -func, or -mode may be set.
