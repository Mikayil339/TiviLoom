# GitHub repository setup (Windows)

1. Install GitHub Desktop: https://desktop.github.com/
2. Extract this ZIP to a normal folder, e.g. `C:\Users\<you>\Documents\TiviLoom`.
3. In GitHub Desktop choose **File → Add local repository** and select that folder. If it says it is not a Git repository, choose **Create a repository** in that folder, name it `TiviLoom`, and do not overwrite the files.
4. Commit all files with message `Add TiviLoom 0.6.6 source and CI build`.
5. Choose **Publish repository** and select the existing GitHub repository `Mikayil339/TiviLoom` only if GitHub Desktop offers that exact destination. If it does not, do not create a second repository; use the GitHub CLI `gh repo clone Mikayil339/TiviLoom` first, copy these project files into the cloned folder (preserving `.git`), then commit and push.
6. Open `https://github.com/Mikayil339/TiviLoom/actions`. The workflow is configured for manual runs and version tags. Run **TiviLoom Release Build** → **Run workflow**.
7. Wait for the job to finish. Download artifacts only if the workflow is green. A green build proves compilation/tests in CI, not real-world stream playback; actual Android phone, Android TV, and LG webOS playback still need device verification.

Never upload signing keys, passwords, provider credentials, or personal playlist URLs to the repository.
