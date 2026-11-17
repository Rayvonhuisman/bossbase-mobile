# GitHub Action Vertalingen

Kopieer `vertalingen.yml` naar `.github/workflows/vertalingen.yml` en push dat met een GitHub-login die de `workflow`-scope heeft (`gh auth refresh -h github.com -s workflow`). Zet daarna in GitHub (Settings → Secrets and variables → Actions) de repository-secret `ANTHROPIC_API_KEY`. Zie CLAUDE.md, sectie Talen.
