import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'

// Load YAML config file
function loadYamlConfig (filename) {
  const configPath = path.join(process.cwd(), 'plugins/github/config', filename)
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8')
    return yaml.load(fileContents)
  } catch (error) {
    logger.error(`Error loading config file ${filename}: ${error}`)
    throw new Error(`Failed to load configuration file: ${filename}`)
  }
}

// Load full configuration
function loadConfig () {
  const config = loadYamlConfig('config.yaml')
  const reposConfig = loadYamlConfig('repos.yaml')

  // Combine the configs
  return {
    ...config,
    repositories: reposConfig.repositories || []
  }
}

// Check if an event is enabled for a specific repo
function isEventEnabledForRepo (eventType, repoName, config) {
  // Find the repository configuration
  const repoConfig = config.repositories.find(repo => repo.name === repoName)

  // If repo has specific event config, check if this event is in the list
  if (repoConfig && repoConfig.events) {
    return repoConfig.events.includes(eventType)
  }

  // Otherwise check global event config
  return config.event_types && config.event_types[eventType] === true
}

// Get groups for a specific repository
function getGroupsForRepo (repoName, config) {
  const repoConfig = config.repositories.find(repo => repo.name === repoName)
  return repoConfig ? repoConfig.groups : config.settings.default_groups
}

// Get repository names array
function getRepoNames (config) {
  return config.repositories.map(repo => repo.name)
}

export {
  loadConfig,
  isEventEnabledForRepo,
  getGroupsForRepo,
  getRepoNames
}
