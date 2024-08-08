import 'dotenv/config';  // Load environment variables from .env file
import puppeteer from 'puppeteer';
import inquirer from 'inquirer';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function postComment(page, comment) {
    try {

        const commentButtonSelector = 'a[data-feed-action="comment"]';
        // Navigate to the comment button
        const commentButton = await page.$(commentButtonSelector);
        if (commentButton) {
            await commentButton.click();
        } else {
            console.error('Comment button not found');
        }
        // Wait for the comment box to appear
        await page.waitForSelector('.comments-comment-box__form-container');

        // Type the comment into the comment box
        await page.type('.comments-comment-box__form textarea', comment);

        // Click the submit button
        await page.click('.comments-comment-box__button-group button[type="submit"]');
    } catch (error) {
        console.error('Error posting comment:', error);
    }
}

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Inquirer prompt for LinkedIn login credentials
        const loginCredentials = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Enter your LinkedIn email:',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Enter your LinkedIn password:',
                mask: '*',
            },
        ]);

        // Navigate to LinkedIn and log in
        await page.goto('https://www.linkedin.com/login');
        await page.type('#username', loginCredentials.email);
        await page.type('#password', loginCredentials.password);
        await page.click('.btn__primary--large');
        await page.waitForNavigation();

        // Navigate to the feed
        await page.goto('https://www.linkedin.com/feed/');

        // Extract feed content
        const feedContent = await page.evaluate(() => {
            const posts = [];
            const elements = document.querySelectorAll('.feed-shared-update-v2__description-wrapper .feed-shared-inline-show-more-text');
            elements.forEach(element => {
                let textContent = element.innerText;
                // Remove hashtags
                textContent = textContent.replace(/#\w+/g, '');
                // Clean up newlines and extra spaces
                textContent = textContent.replace(/\s+/g, ' ').trim();
                posts.push(textContent);
            });
            return posts;
        });

        console.log('Feed content:', feedContent);

        // Generate comments for each post with delay to handle rate limits
        for (const post of feedContent) {
            const prompt = 'Generate a comment for the following feed content:'+ post +' only give the comment do not include any accompanying text.';
            const comment = await generateComment(prompt);
            if (comment) {
                console.log('Generated comment:', comment);

                // Post the comment on LinkedIn
                await postComment(page, comment);
            }
            await delay(60000); // Delay for 1 minute
        }

        await browser.close();
    } catch (error) {
        console.error('Error:', error);
    }
})();