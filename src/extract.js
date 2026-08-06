const fs = require('fs');
const axios = require('axios');
const core = require('@actions/core');
const exec = require('@actions/exec');

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = 'shrink/actions-docker-extract';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 },
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error('\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m');
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

async function run() {
  try {
    await validateSubscription();
    const image = core.getInput('image');
    const path = core.getInput('path');
    const destination = core.getInput('destination') || `extracted-${Date.now()}`;
    if (!core.getInput('destination')) {
      core.notice([
        'As you did not specify a docker extract destination, the default is being used.',
        'As of shrink/actions-docker-extract@v3.0.1 the default does not include a dot prefix.',
        `v3.0.0: ".${destination}", v3.0.1: "${destination}"`,
        'See https://github.com/shrink/actions-docker-extract/issues/28 for context.',
        'No action is required unless this Workflow depends upon the dot prefix.',
      ].join(' '));
    }

    await exec.exec('mkdir', ['-p', destination]);

    let containerId = '';
    await exec.exec('docker', ['create', image], {
      listeners: {
        stdout: (data) => { containerId += data.toString(); },
      },
    });
    containerId = containerId.trim();

    await exec.exec('docker', ['cp', `${containerId}:/${path}`, destination]);

    core.setOutput('destination', destination);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
