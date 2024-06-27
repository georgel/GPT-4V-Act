const puppeteer = require('puppeteer-extra');
const EventEmitter = require('events');

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const {executablePath} = require('puppeteer')

class OpenAIChatController extends EventEmitter {
    constructor() {
        super();
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: false, // Launch browser in non-headless mode so you can see what's happening
            userDataDir: "./user_data", // Persist user data so you can login
            executablePath: executablePath()
        });
        this.page = await this.browser.newPage();
        await this.page.exposeFunction('emitEndTurn', (data) => this.emit('end_turn', data));

        await this.page.goto('http://localhost:3000/');
        await this.preparePage();
    }

    async preparePage() {
        await this.page.waitForSelector('input[type="file"]');
        await this.page.evaluate(() => {
            const { fetch: origFetch } = window;
            window.fetch = async (...args) => {
                const response = await origFetch(...args);
                if (args[0] === "/openai/chat/completions") {
                    console.log("intercepting conversation...");

                    const { body } = response.clone();
                    const raw = await new Response(body).text();
                    const chunks = raw.split('\ndata: ');
                    const results = [];
                    for (let chunk of chunks) {
                        chunk = chunk.trim();
                        if (chunk.startsWith('{')) {
                            try {
                                let msg = JSON.parse(chunk);
                                if (msg.choices[0].delta.content) {
                                    results.push(msg.choices[0].delta.content);
                                }
                            } catch (ex) { }
                        }
                    }
                    if (results.length > 0) {
                        window.emitEndTurn(results.join(''));
                    }
                }

                return response;
            };
        });
    }

    async typeIntoPrompt(text) {
        if (!this.page) {
            throw new Error('You need to initialize first');
        }
        console.log('typing into prompt with text: ' + text);
        await this.page.type('#chat-textarea', text.split('\n').join(';'));
    }

    async clickSendButton() {
        if (!this.page) {
            throw new Error('You need to initialize first');
        }
        // await this.page.waitForSelector('button[id="send-message-button"]:not([disabled])');
        await this.page.click('[id="send-message-button"]');
    }

    async uploadImage(filePath) {
        if (!this.page) {
            throw new Error('You need to initialize first');
        }
        await this.page.reload();
        await this.preparePage();

        const input = await this.page.$('input[type="file"]');
        await input.uploadFile(filePath);
        // wait until upload is complete
        // await this.page.waitForSelector('button[id="send-message-button"]:not([disabled])');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}


module.exports = OpenAIChatController;
