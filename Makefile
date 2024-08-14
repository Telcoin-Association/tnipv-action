.PHONY: help test build

# full path for the Makefile
ROOT_DIR:=$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
BASE_DIR:=$(shell basename $(ROOT_DIR))

.DEFAULT: help

help:
	@echo ;
	@echo "make test" ;
	@echo "    :::> Build the docker image and run the tests." ;
	@echo ;
	@echo "make build-lint-js" ;
	@echo "    :::> Build the docker image and build the npm package." ;
	@echo ;

# build and run the docker image
#
# always build to ensure latest changes included for tests
test:
	docker build -t tnipva:latest . ;
	docker run --rm -v ./:/tnipv --name tnipva-test -t tnipva:latest test;

# build and run the docker image
#
# always build to ensure latest changes included for build
build-lint-js:
	docker build -t tniv:latest . ;
	docker run --rm -v ./:/tnipv --name tniv-build -t tniv:latest build -t nodejs ;

# build and run the docker image
#
# always build to ensure latest changes included for publish
publish-lint-js:
	docker build -t tniv:latest . ;
	docker run --rm -v ./:/tnipv --name tniv-publish -t tniv:latest publish -t nodejs ;
