// index.js
const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');

async function run() {
  try {
    // Get inputs
    const appUrl = 'https://e80c-200-80-234-200.ngrok-free.app/api/github';
    const repository = core.getInput('repository');
    const sha = core.getInput('sha');
    const eventType = core.getInput('event-type');
    const prNumber = core.getInput('pr-number');
    const branch = core.getInput('branch');
    const checkName = core.getInput('check-name');

    // Get GITHUB_TOKEN from environment
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN not available. Make sure to include permissions in your workflow.');
    }

    // Create an Octokit client
    const octokit = new Octokit({ auth: token });

    // Extract owner and repo
    const [owner, repo] = repository.split('/');

    // Option 1: Create check run directly using GitHub API
    try {
      const checkRun = await octokit.checks.create({
        owner,
        repo,
        name: checkName,
        head_sha: sha,
        status: 'in_progress',
        output: {
          title: `Running ${checkName}`,
          summary: 'Check is in progress...'
        }
      });

      core.info(`Successfully created check run: ${checkRun.data.id}`);
      
      // Set outputs
      core.setOutput('check-run-id', checkRun.data.id);
      core.setOutput('status', 'success');
      core.setOutput('message', 'Check run created directly via GitHub API');
      
      return;
    } catch (error) {
      // If direct check creation fails (due to permissions), fall back to calling your app
      core.warning(`Could not create check directly: ${error.message}`);
      core.info('Falling back to your GitHub App API endpoint');
    }

    // Option 2: Call your GitHub App API (fallback)
    // Prepare payload for your app
    const payload = {
      repository,
      sha,
      event_type: eventType,
      pr_number: prNumber || undefined,
      branch,
      check_name: checkName,
      // Include a JWT token for authentication between action and app
      installation_id: github.context.payload.installation?.id
    };

    // Get default fetch from Node.js (for Node.js 18+)
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    // Call your app API
    const response = await fetch(appUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Token': token
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${text}`);
    }

    const responseData = await response.json();

    // Set outputs
    core.setOutput('check-run-id', responseData.check_id || '');
    core.setOutput('status', 'success');
    core.setOutput('message', responseData.message || 'Check triggered successfully');

    core.info(`Successfully triggered check run: ${responseData.check_id || 'unknown'}`);
  } catch (error) {
    core.setOutput('status', 'failure');
    core.setOutput('message', error.message);
    core.setFailed(error.message);
  }
}

run();
