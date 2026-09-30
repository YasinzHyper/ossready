export function fundingYmlText(opts?: { githubOwner?: string }): string {
  const owner = opts?.githubOwner?.trim();
  if (owner) {
    return `# These are supported funding model platforms
github: [${owner}]
# patreon: # Replace with a single Patreon username
# open_collective: # Replace with a single Open Collective username
# ko_fi: # Replace with a single Ko-fi username
# tidelift: # Replace with a single Tidelift platform-name/package-name
# custom: # Replace with up to 4 custom sponsorship URLs e.g., ['link1', 'link2']
`;
  }
  return `# These are supported funding model platforms
# Uncomment and set your GitHub Sponsors username (or pass --github-owner to ossready init)
# github: [YOUR_GITHUB_USERNAME]
# patreon: # Replace with a single Patreon username
# open_collective: # Replace with a single Open Collective username
# ko_fi: # Replace with a single Ko-fi username
# tidelift: # Replace with a single Tidelift platform-name/package-name
# custom: # Replace with up to 4 custom sponsorship URLs e.g., ['link1', 'link2']
`;
}
