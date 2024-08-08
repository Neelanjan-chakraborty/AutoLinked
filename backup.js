import puppeteer from 'puppeteer';

const username = 'email@gmail.com'; // Replace with your LinkedIn email
const password = '**********'; // Replace with your LinkedIn password
const randomComments = [
  "Great post!",
  "Very insightful!",
  "Thanks for sharing!",
  "Interesting read!",
  "I totally agree!",
  "This is so relevant right now!",
];
const numPosts =10; // Number of posts to comment on
const pauseDuration = 5000; // Pause duration between posts in milliseconds

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function postRandomComments() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Go to LinkedIn login page
    await page.goto('https://www.linkedin.com/login');
    console.log("Navigated to LinkedIn login page.");

    // Enter username
    await page.type('#username', username);
    console.log("Entered username.");

    // Enter password
    await page.type('#password', password);
    console.log("Entered password.");

    // Click login button
    await page.click('button[type="submit"]');
    console.log("Clicked login button.");

    // Wait for navigation after login
    await page.waitForNavigation({ timeout: 60000 });
    console.log("Navigation after login completed.");

    // Wait for the feed container to load
    await page.waitForSelector('#voyager-feed', { timeout: 60000 });
    console.log("Feed container loaded.");

    for (let i = 0; i < numPosts; i++) {
      // Wait for the post to appear
      const postSelector = '.feed-shared-update-v2';
      await page.waitForSelector(postSelector, { timeout: 60000 });
      console.log(`Post ${i + 1} loaded.`);

      // Select the current post
      const posts = await page.$$(postSelector);
      const postElement = posts[i];

      if (postElement) {
        // Extract author's name
        const authorNameSelector = '.update-components-actor__name';
        const authorNameElement = await postElement.$(authorNameSelector);
        const authorName = authorNameElement ? await page.evaluate(el => el.innerText, authorNameElement) : 'Unknown';
        console.log(`Author: ${authorName}`);

        // Choose a random comment
        const randomComment = randomComments[Math.floor(Math.random() * randomComments.length)];

        // Find and click the comment button
        const commentButtonSelector = 'button[id^="feed-shared-social-action-bar-comment-"]'; // Adjust selector if necessary
        const commentButton = await postElement.$(commentButtonSelector);
        if (commentButton) {
          await commentButton.click();
          console.log("Clicked the comment button.");

          // Wait for the comment box to appear
          const commentBoxSelector = '.ql-editor[contenteditable="true"]';
          await page.waitForSelector(commentBoxSelector, { timeout: 60000 });
          console.log("Comment box appeared.");

          // Type and submit the comment
          const commentBox = await page.$(commentBoxSelector);
          await commentBox.type(randomComment);
          console.log("Typed the comment.");

          // Click the 'Comment' button to submit using XPath with ::-p-xpath
          const submitButtonXPath = `//div[contains(@class, 'display-flex') and contains(@class, 'align-items-center')]//span[text()='Comment']/ancestor::button[1]`;
          const submitButton = await page.waitForSelector(`::-p-xpath(${submitButtonXPath})`);
          if (submitButton) {
            await submitButton.click();
            console.log("Submitted the comment.");


            // Log the comment posted
            console.log(`Comment posted: "${randomComment}"`);

            // Pause before moving to the next post
            await sleep(pauseDuration);
          } else {
            console.log('Submit button not found.');
          }
        } else {
          console.log('Comment button not found.');
        }
      } else {
        console.log('No post found.');
        break;
      }

      // Scroll to the next post
      if (i < numPosts - 1) {
        await page.evaluate((selector, index) => {
          const elements = document.querySelectorAll(selector);
          if (elements[index + 1]) {
            elements[index + 1].scrollIntoView();
          }
        }, postSelector, i);
        await sleep(1000); // Small pause after scrolling
      }
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // Close the browser
    await browser.close();
  }
}

postRandomComments().catch(console.error);
