import { formatDate, getMasterQQ, render } from './common.js'
import { isEventEnabledForRepo, getGroupsForRepo } from './config.js'
import {
  handleDiscussionEvent,
  handleIssueCommentEvent,
  handleIssuesEvent,
  handlePREvent, handleProjectEvent,
  handlePushEvent, handleReleaseEvent, handleSecurityAlertEvent,
  handleStarEvent, handleWorkflowRunEvent
} from './events.js'

const notificationTracker = {}

const pendingEvents = {}

async function handleEvent (payload, event, config) {
  const repoName = payload.repository.full_name
  const repoNames = config.repositories.map(repo => repo.name)

  // Check if we're tracking this repo
  if (repoNames.indexOf(repoName) === -1) {
    return
  }

  // Check if this event type is enabled for this repo
  if (!isEventEnabledForRepo(event, repoName, config)) {
    logger.info(`Event ${event} is disabled for repository ${repoName}. Skipping.`)
    return
  }

  // // Check if we should send a notification
  // if (!shouldSendNotification(event, payload, config)) {
  //   logger.info(`Skipping notification for ${event} due to anti-spam rules.`)
  //   return
  // }

  const targetGroups = getGroupsForRepo(repoName, config)
  let time = formatDate(new Date())
  const repoAvatar = payload.repository.owner.avatar_url
  const description = payload.repository.description

  logger.info(`Processing ${event} event for ${repoName}`)

  let eventData
  switch (event) {
    case 'issues':
      eventData = await handleIssuesEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'pull_request':
      eventData = await handlePREvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'push':
      eventData = await handlePushEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'issue_comment':
      eventData = await handleIssueCommentEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'star':
      eventData = await handleStarEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'release':
      eventData = await handleReleaseEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'discussion':
      eventData = await handleDiscussionEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'workflow_run':
      eventData = await handleWorkflowRunEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'security_alert':
      eventData = await handleSecurityAlertEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    case 'project':
    case 'project_card':
      eventData = await handleProjectEvent(payload, repoAvatar, repoName, description, time, targetGroups, config)
      break
    default:
      logger.info(`Unhandled event type: ${event}`)
  }

  if (eventData) {
    // Get notification settings
    const spamControl = config.notification_control || {}
    const priorityEvents = spamControl.priority_events || ['security_alert', 'release']

    // If it's a priority event, send immediately
    if (priorityEvents.includes(event)) {
      await sendNotification(eventData.templatePath, eventData.data, targetGroups, config)
    } else {
      // Otherwise, schedule it for potential grouping
      scheduleNotification(repoName, event, eventData, targetGroups, config)
    }
  }
}

// Logic to determine if a notification should be sent
function shouldSendNotification (event, payload, config) {
  const spamControl = config.notification_control || {}
  const minInterval = spamControl.min_notification_interval || 300000 // 5 minutes default
  const minCommits = spamControl.min_commits_to_notify || 2
  const priorityEvents = spamControl.priority_events || ['security_alert', 'release']

  // Priority events always get sent
  if (priorityEvents.includes(event)) {
    return true
  }

  // Special rules for specific events
  if (event === 'push') {
    // Don't notify for empty commits or small commit batches
    if (!payload.commits || payload.commits.length < minCommits) {
      return false
    }

    // Don't notify for automated commits
    const automatedMessages = ['[bot]', 'automated', 'version bump', 'changelog']
    if (payload.commits.every(commit =>
      automatedMessages.some(msg => commit.message.toLowerCase().includes(msg)))) {
      return false
    }
  }

  // Time-based throttling for each repository
  const repoKey = payload.repository.full_name
  const now = Date.now()
  const lastNotificationTime = notificationTracker[repoKey] || 0

  // If we've sent a notification for this repo recently, skip this one
  if (now - lastNotificationTime < minInterval) {
    return false
  }

  // Update the tracker
  notificationTracker[repoKey] = now
  return true
}

// Schedule notification function - manages pending notifications
function scheduleNotification (repoName, eventType, eventData, targetGroups, config) {
  // Get grouping settings
  const spamControl = config.notification_control || {}
  const groupingDelay = spamControl.notification_grouping_delay || 10000 // 10 seconds default
  const maxEvents = spamControl.max_events_per_notification || 5

  const key = `${repoName}-${eventType}`

  // If we already have a pending notification for this repo+event type
  if (pendingEvents[key]) {
    // Add to the existing group if under the limit
    if (pendingEvents[key].items.length < maxEvents) {
      pendingEvents[key].items.push(eventData)
    }
    return
  }

  // Schedule a new notification
  pendingEvents[key] = {
    items: [eventData],
    targetGroups,
    timer: setTimeout(() => {
      processPendingEvents(key, config)
    }, groupingDelay)
  }
}

// Process and send grouped notifications
async function processPendingEvents (key, config) {
  try {
    const pending = pendingEvents[key]

    if (!pending || !pending.items || pending.items.length === 0) {
      delete pendingEvents[key]
      return
    }

    const targetGroups = pending.targetGroups
    const items = pending.items

    // If there's only one item, send a normal notification
    if (items.length === 1) {
      await sendNotification(
        items[0].templatePath,
        items[0].data,
        targetGroups,
        config
      )
    } else {
      // Send a grouped notification
      await sendGroupedNotification(key, items, targetGroups, config)
    }

    // Clear the pending events
    delete pendingEvents[key]
  } catch (error) {
    logger.error(`Error processing pending events for ${key}: ${error}`)
    // Make sure to clean up even on error
    delete pendingEvents[key]
  }
}

// Send a grouped notification
async function sendGroupedNotification (key, items, targetGroups, config) {
  try {
    // Extract repo name and event type from the key
    const [repoName, eventType] = key.split('-')

    // Prepare grouped data
    const groupedData = {
      repoName,
      eventType,
      time: formatDate(new Date()),
      count: items.length,
      events: items.map(item => item.data)
    }

    // We'll need to create special templates for grouped notifications
    const templatePath = `github/grouped/${eventType}/index`

    // Render and send
    let master = await getMasterQQ()
    let res = await render('github', templatePath, groupedData, { retType: 'base64' })

    if (config.settings.send_to_master) {
      Bot.sendPrivateMsg(master, res).catch((err) => {
        logger.error(`Error sending grouped notification to master: ${err}`)
      })
    }

    targetGroups.forEach(gId => {
      Bot.sendGroupMsg(gId, res).catch((err) => {
        logger.error(`Error sending grouped notification to group ${gId}: ${err}`)
      })
    })
  } catch (error) {
    logger.error(`Error sending grouped notification: ${error}`)
  }
}

// Regular notification sending function
async function sendNotification (templatePath, data, targetGroups, config) {
  try {
    let master = await getMasterQQ()
    let res = await render('github', templatePath, data, { retType: 'base64' })

    if (config.settings.send_to_master) {
      Bot.sendPrivateMsg(master, res).catch((err) => {
        logger.error(`Error sending to master: ${err}`)
      })
    }

    targetGroups.forEach(gId => {
      Bot.sendGroupMsg(gId, res).catch((err) => {
        logger.error(`Error sending to group ${gId}: ${err}`)
      })
    })
  } catch (error) {
    logger.error(`Error rendering template: ${error}`)
  }
}



export { handleEvent }
