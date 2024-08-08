import 'dotenv/config';  // Load environment variables from .env file
import puppeteer from 'puppeteer';
import fs from 'fs';
import csv from 'csv-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Fetch username and password from environment variables
const username = process.env.LINKEDIN_USERNAME;
const password = process.env.LINKEDIN_PASSWORD;
// const randomComments = [
//   "Great post!",
//   "Very insightful!",
//   "Thanks for sharing!",
//   "Interesting read!",
//   "I totally agree!",
//   "This is so relevant right now!",
// ];
const numPosts = 20; // Number of posts to comment on
const pauseDuration = 5000; // Pause duration between posts in milliseconds
const csvFile = 'last_post_id.csv';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loginToLinkedIn(page) {
  await page.goto('https://www.linkedin.com/login');
  console.log("Navigated to LinkedIn login page.");

  await page.type('#username', username);
  console.log("Entered username.");

  await page.type('#password', password);
  console.log("Entered password.");

  await page.click('button[type="submit"]');
  console.log("Clicked login button.");

  await page.waitForNavigation({ timeout: 60000 });
  console.log("Navigation after login completed.");
}

async function loadFeed(page) {
  await page.waitForSelector('#voyager-feed', { timeout: 60000 });
  console.log("Feed container loaded.");
}

async function generateComment(prompt) {
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating comment:', error);
        return null;
    }
}

async function getPosts(page) {
  const postSelector = '.feed-shared-update-v2';
  await page.waitForSelector(postSelector, { timeout: 60000 });
  return await page.$$(postSelector);
}

async function extractPostId(postElement, page) {
  return await page.evaluate(post => {
    const h2 = post.querySelector('h2.visually-hidden');
    return h2 ? h2.innerText : null;
  }, postElement);
}

async function postComment(postElement, feedContent, page) {
  const commentButtonSelector = 'button[id^="feed-shared-social-action-bar-comment-"]';
  const commentButton = await postElement.$(commentButtonSelector);
  if (commentButton) {
    await commentButton.click();
    console.log("Clicked the comment button.");

    const commentBox = await page.evaluateHandle(button => {
      const box = button.closest('.feed-shared-update-v2').querySelector('.ql-editor');
      return box ? box : null;
    }, commentButton);

    if (commentBox) {
      console.log("Comment box appeared.");
      const prompt='Generate a comment for the following feed content:'+ feedContent +' only give the comment do not include any accompanying text.';
      const generatedComment = await generateComment(prompt);
      await commentBox.type(generatedComment);
      console.log("Typed the comment.");

      const submitButtonXPath = `//div[contains(@class, 'display-flex') and contains(@class, 'align-items-center')]//span[text()='Comment']/ancestor::button[1]`;
      const submitButton = await page.waitForSelector(`::-p-xpath(${submitButtonXPath})`);
      if (submitButton) {
        await submitButton.click();
        console.log("Submitted the comment.");
        console.log(`Comment posted: "${generatedComment}"`);
        return true;
      } else {
        console.log('Submit button not found.');
      }
    } else {
      console.log('Comment box not found next to the comment button.');
    }
  } else {
    console.log('Comment button not found.');
  }
  return false;
}

function loadLastProcessedPostId() {
  return new Promise((resolve, reject) => {
    let lastPostId = null;
    if (fs.existsSync(csvFile)) {
      fs.createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          lastPostId = row.postId;
        })
        .on('end', () => {
          resolve(lastPostId);
        })
        .on('error', reject);
    } else {
      resolve(null);
    }
  });
}

function saveLastProcessedPostId(postId) {
  const data = `postId\n${postId}\n`;
  fs.writeFileSync(csvFile, data);
  console.log(`Saved last processed post ID: ${postId}`);
}

async function processPosts(page, posts, processedPosts, lastPostId) {
  let postsCommented = 0;
  let startCommenting = lastPostId === null;

  for (let i = 0; i < posts.length; i++) {
    const postElement = posts[i];
    const postId = await extractPostId(postElement, page);

    if (postId && !startCommenting) {
      if (postId === lastPostId) {
        startCommenting = true;
        continue;
      }
      continue;
    }

    if (postId && processedPosts.has(postId)) {
      console.log(`Skipping post with ID ${postId} as it's already processed.`);
      continue;
    }

    await page.evaluate(post => {
      post.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, postElement);
    console.log(`Scrolling to post ${i + 1}.`);

    const feedContent = await page.evaluate(() => {
        const postss = [];
        const elements = document.querySelectorAll('.feed-shared-update-v2__description-wrapper .feed-shared-inline-show-more-text');
        elements.forEach(element => {
            let textContent = element.innerText;
            // Remove hashtags
            textContent = textContent.replace(/#\w+/g, '');
            // Clean up newlines and extra spaces
            textContent = textContent.replace(/\s+/g, ' ').trim();
            postss.push(textContent);
        });
        return postss.join(' '); // Join all post contents into one string
    });

    console.log('Feed content:', feedContent);

    await sleep(2000);

    const commented = await postComment(postElement, feedContent, page);
    if (commented) {
      postsCommented++;
      if (postId) {
        processedPosts.add(postId);
        saveLastProcessedPostId(postId);
      }
      await sleep(pauseDuration);
      break;
    }
  }
  return postsCommented;
}

async function clickShowMoreButton(page) {
  const showMoreButtonXPath = `//span[text()='Show more feed updates']/ancestor::button[1]`;
  const showMoreButton = await page.waitForSelector(`::-p-xpath(${showMoreButtonXPath})`, { timeout: 10000 }).catch(() => null);
  if (showMoreButton) {
    await showMoreButton.click();
    console.log("Clicked 'Show more feed updates' button.");
    return true;
  } else {
    console.log('No more posts available.');
    return false;
  }
}

async function handleErrors(page, error) {
  console.error('An error occurred:', error);
  await page.goto('https://www.linkedin.com/feed/');
  console.log('Redirected to LinkedIn feed page.');
}

async function postRandomComments() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  console.log("Viewport size set to 1920x1080.");

  try {
    await loginToLinkedIn(page);
    await loadFeed(page);

    const processedPosts = new Set();
    let postsCommented = 0;
    let lastPostId = await loadLastProcessedPostId();
    console.log(`Last processed post ID: ${lastPostId}`);

    while (postsCommented < numPosts) {
      const posts = await getPosts(page);
      console.log(`Found ${posts.length} posts.`);

      try {
        postsCommented += await processPosts(page, posts, processedPosts, lastPostId);
      } catch (error) {
        await handleErrors(page, error);
        continue;
      }

      if (postsCommented < numPosts) {
        const morePostsAvailable = await clickShowMoreButton(page);
        if (!morePostsAvailable) break;
      }
    }
  } catch (error) {
    await handleErrors(page, error);
  } finally {
    await browser.close();
  }
}

postRandomComments().catch(console.error);
