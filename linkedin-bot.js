import puppeteer from 'puppeteer';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log(chalk.green('Welcome to the LinkedIn Auto Connect Bot!'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Enter your LinkedIn email:',
      validate: (input) => input ? true : 'Email is required!',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your LinkedIn password:',
      mask: '*',
      validate: (input) => input ? true : 'Password is required!',
    }
  ]);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000); // Set navigation timeout to 60 seconds

  await page.goto('https://www.linkedin.com/login');

  // Login
  await page.type('#username', answers.email);
  await page.type('#password', answers.password);
  await page.click('.btn__primary--large');

  console.log(chalk.yellow('Logging in...'));

  // Wait for the global navigation button to confirm login
  await page.waitForSelector('#global-nav > div > nav > ul > li:nth-child(2) > a');

  // Navigate to the My Network tab
  await page.click('#global-nav > div > nav > ul > li:nth-child(2) > a');

  console.log(chalk.yellow('Navigating to My Network...'));

  // Wait for the My Network page to load
  await page.waitForSelector('body');

  // Auto-scroll to the bottom of the page until no more new content is loaded
  let previousHeight;
  while (true) {
    // Scroll down
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await wait(2000); // Wait for new content to load

    let newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break; // Exit loop if no more new content
  }

  console.log(chalk.yellow('All content loaded, finding Connect buttons...'));

  // Function to find and click 'Connect' buttons
  const autoConnect = async () => {
    // Find all profile cards
    const profileCards = await page.$$('section.artdeco-card');

    for (let card of profileCards) {
      try {
        // Find the "Connect" button within the card
        const connectButton = await card.$('button[aria-label*="Invite"]');
        
        if (!connectButton) {
          console.error(chalk.red('Connect button not found'));
          continue;
        }

        // Find the name and occupation elements within the card
        const nameElement = await card.$('.discover-person-card__name');
        const bioElement = await card.$('.discover-person-card__occupation');

        if (!nameElement || !bioElement) {
          console.error(chalk.red('Name or Bio element not found'));
          continue;
        }

        // Extract text content from name and bio elements
        const name = await page.evaluate(el => el.textContent.trim(), nameElement);
        const bio = await page.evaluate(el => el.textContent.trim(), bioElement);

        console.log(chalk.blue(`Clicked Connect for: ${name}`));

        // Click the "Connect" button
        await connectButton.click();
        // Add a delay to mimic human behavior
        await wait(1000);

        // Save to CSV
        fs.appendFileSync('connections.csv', `"${name}","${bio}"\n`);
      } catch (error) {
        console.error(chalk.red(`Error processing button: ${error.message}`));
      }
    }
  };

  // Execute the auto-connect function
  await autoConnect();

  console.log(chalk.green('Finished connecting with people!'));

  // Close the browser
  await browser.close();
})();
