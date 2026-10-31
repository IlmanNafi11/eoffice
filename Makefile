.PHONY: lint test build ci frontend-test frontend-typecheck frontend-build

frontend-test:
	npm test

frontend-typecheck:
	npm run typecheck

frontend-build:
	npm run build

ci: lint test frontend-test frontend-typecheck frontend-build
	@echo "ci: all targets passed"

lint:
	vendor/bin/pint --test

test:
	php artisan test --compact

build:
	docker build --check .

