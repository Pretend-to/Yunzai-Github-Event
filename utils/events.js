async function handleIssuesEvent (payload, repoAvatar, repoName, description, time) {
  const issueUrl = payload.issue.html_url
  const user = payload.issue.user
  const title = payload.issue.title
  const body = payload.issue.body
  let stateReason

  if (payload.action === 'closed') {
    stateReason = payload.issue.state_reason
  }

  return {
    templatePath: 'github/issues/index',
    data: {
      repoAvatar,
      repoName,
      description,
      time,
      action: payload.action,
      issueUrl,
      user: user.login,
      userAvatar: user.avatar_url,
      title,
      body,
      stateReason
    }
  }
}

async function handlePREvent (payload, repoAvatar, repoName, description, time) {
  const {
    created_at,
    updated_at,
    closed_at,
    merged_at,
    html_url,
    user,
    title,
    body
  } = payload.pull_request
  let mergedBy

  if (payload.action === 'closed' && payload.pull_request.merged) {
    mergedBy = payload.pull_request.merged_by.login
  }

  return {
    templatePath: 'github/pr/index',
    data: {
      repoAvatar,
      repoName,
      description,
      time,
      action: payload.action,
      prUrl: html_url,
      user: user.login,
      userAvatar: user.avatar_url,
      title,
      body,
      created_at,
      updated_at,
      closed_at,
      merged: merged_at ? `merged by ${mergedBy} at ${merged_at}` : undefined
    }
  }

}

async function handlePushEvent (payload, repoAvatar, repoName, description, time) {
  const { name } = payload.pusher
  const commits = payload.commits.map(commit => {
    const {
      message,
      author
    } = commit
    return {
      message,
      author: author.name
    }
  })

  return {
    templatePath: 'github/push/index',
    data: {
      repoAvatar,
      repoName,
      description,
      time,
      pusherName: name,
      commits
    }
  }
}

async function handleIssueCommentEvent (payload, repoAvatar, repoName, description, time) {
  const {
    action,
    issue,
    comment
  } = payload

  // Only handle comment creation for now
  if (action === 'created') {
    const user = comment.user
    const commentBody = comment.body
    const commentUrl = comment.html_url
    const issueTitle = issue.title
    const issueUrl = issue.html_url
    const isPullRequest = !!issue.pull_request

    return {
      templatePath: 'github/issue_comment/index',
      data: {
        repoAvatar,
        repoName,
        description,
        time,
        commentUrl,
        issueUrl,
        issueTitle,
        user: user.login,
        userAvatar: user.avatar_url,
        commentBody,
        isPullRequest
      }
    }
  }
}

async function handleStarEvent (payload, repoAvatar, repoName, description, time) {
  const {
    action,
    sender,
    starred_at
  } = payload

  // Only handle star creation
  if (action === 'created') {
    const user = sender
    const starredTime = starred_at ? new Date(starred_at).toLocaleString() : time

    return {
      templatePath: 'github/star/index',
      data: {
        repoAvatar,
        repoName,
        description,
        time,
        user: user.login,
        userAvatar: user.avatar_url,
        starredTime
      }
    }
  }
}

async function handleReleaseEvent (payload, repoAvatar, repoName, description, time) {
  // Only handle published releases
  if (payload.action === 'published') {
    const release = payload.release
    const tagName = release.tag_name
    const releaseName = release.name || tagName
    const body = release.body // Release notes
    const releaseUrl = release.html_url
    const isDraft = release.draft
    const isPrerelease = release.prerelease
    const author = release.author

    return {
      templatePath: 'github/release/index',
      data: {
        repoAvatar,
        repoName,
        description,
        time,
        tagName,
        releaseName,
        body,
        releaseUrl,
        isDraft,
        isPrerelease,
        user: author.login,
        userAvatar: author.avatar_url
      }
    }
  }
}

async function handleDiscussionEvent (payload, repoAvatar, repoName, description, time) {
  // Filter to just created and answered actions
  if (['created', 'answered'].includes(payload.action)) {
    const discussion = payload.discussion
    const title = discussion.title
    const body = discussion.body
    const url = discussion.html_url
    const category = discussion.category.name
    const user = discussion.user

    return {
      templatePath: 'github/discussion/index',
      data: {
        repoAvatar,
        repoName,
        description,
        time,
        action: payload.action,
        title,
        body,
        url,
        category,
        user: user.login,
        userAvatar: user.avatar_url
      }
    }
  }
}

async function handleWorkflowRunEvent (payload, repoAvatar, repoName, description, time) {
  // Only report completed workflow runs
  if (payload.action === 'completed') {
    const workflow = payload.workflow_run
    const name = workflow.name
    const conclusion = workflow.conclusion // success, failure, etc.
    const url = workflow.html_url
    const branch = workflow.head_branch

    // Only notify on failures or first success after failure to reduce noise
    if (conclusion === 'failure' || conclusion === 'success') {
      return {
        templatePath: 'github/workflow/index',
        data: {
          repoAvatar,
          repoName,
          description,
          time,
          workflowName: name,
          conclusion,
          url,
          branch
        }
      }
    }
  }
}

async function handleSecurityAlertEvent (payload, repoAvatar, repoName, description, time) {
  const alert = payload.alert
  const severity = alert.severity
  const affectedPackage = alert.affected_package_name
  const affectedRange = alert.affected_range
  const fixedIn = alert.fixed_in
  const url = alert.html_url

  return {
    templatePath: 'github/security/index',
    data: {
      repoAvatar,
      repoName,
      description,
      time,
      severity,
      affectedPackage,
      affectedRange,
      fixedIn,
      url
    }
  }
}

async function handleProjectEvent (payload, repoAvatar, repoName, description, time) {
  // Only notify for significant changes, not every card move
  if (['created', 'moved', 'converted'].includes(payload.action)) {
    const project = payload.project
    const projectName = project.name
    const projectUrl = project.html_url
    const card = payload.project_card
    const cardContent = card?.note || 'No content'
    const user = payload.sender

    return {
      templatePath: 'github/project/index',
      data: {
        repoAvatar,
        repoName,
        description,
        time,
        action: payload.action,
        projectName,
        projectUrl,
        cardContent,
        user: user.login,
        userAvatar: user.avatar_url
      }
    }
  }
}

export {
  handleIssuesEvent,
  handlePREvent,
  handlePushEvent,
  handleIssueCommentEvent,
  handleStarEvent,
  handleReleaseEvent,
  handleDiscussionEvent,
  handleWorkflowRunEvent,
  handleSecurityAlertEvent,
  handleProjectEvent
}
