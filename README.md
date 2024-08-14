tnipv-action
===========

A GitHub Action for running `tnipv`, an Telcoin Network Improvement Proposal linter.

This is a Telcoin Network specific implementation of [EIPW-Action](https://github.com/ethereum/eipw-action/tree/799f24bcc83daf9a3959459f49c45ebbc7ff4fe9).
We sincerely appreciate their effort, their quality of code, and their spirit of open-sourceness.

## Usage

Here's an example workflow (so it would go in `.github/workflows/ci.yml` or similar):

```yaml
on:
  pull_request:

name: ci

jobs:
  check:
    name: Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: telcoin-association/tnipv-action@dist
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Building & Deploying

```bash
npm install         # Grab dependencies.
npm run build       # Compile TypeScript and create bundle.
git add .
git commit
git push            # Make the new build available.
```
