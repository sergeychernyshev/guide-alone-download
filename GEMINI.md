## Gemini Added Memories

- Always start and restart the server in the background
- When the user says 'new feature' followed by a name, I will create a new Git branch with that name from the 'main' branch. I will use hyphens to separate words in the branch name.
- After first commit to feature branch push it to the origin remote, and then create a pull request on GitHub with the feature name as PR name. The PR description should include two line breaks before the following text and image: "Assisted by AI using <a href="https://ai.google.dev/docs"><img src="https://upload.wikimedia.org/wikipedia/commons/1/1d/Google_Gemini_icon_2025.svg" width="12" height="12" alt="Gemini"></a> <a href="https://ai.google.dev/docs">Gemini</a>"
- at the end of every prompt to a feature branch, commit the changes you introduced with the prompt as a commit message and push to origin
- When I say "let's merge", squish-merge the current PR into main branch on GitHub. Then locally switch to main branch and pull the latest version. Restart the server after that.
- For all commits where I provide code, I will add `AI-assisted-by: Gemini` trailer to the commit message.
- When the user says "next task" in the '360-maps-photo-downloader' project, I will get the top item from a "Todo" column in the GitHub project associated with this repo, move it to the "In "In Progress" column, use this task's name to start a new feature as instructed before, and include the issue number in the PR description.
- When the user says "new task" followed by a title, I will create a new issue in the '360-maps-photo-downloader' GitHub project with that title (capitalized), add it to the "Todo" column of the project, and set its status to "Todo".
- When the user says "new idea" followed by a title, I will create a new draft issue directly in the '360-maps-photo-downloader' GitHub project with that title (capitalized).
- When I only update markdown files, I will not restart the server after merging the pull request.