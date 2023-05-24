<p align=center>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/10895136/228003796-7e3319ad-f0b1-4da9-a2d0-6cf67ccc7a32.png">
    <img height="200px" alt="Pythagora Logo" src="https://user-images.githubusercontent.com/10895136/228003796-7e3319ad-f0b1-4da9-a2d0-6cf67ccc7a32.png">
  </picture>
</p>

<h3 align="center">Pythagora API server</h3>
<br>
<p>This is Pythagora API server repository which is currently handling exporting of Pythagora tests to Jest. It will be updated with future features that require LLMs.</p>
<p>If you want to see Pythagora npm package click <a href="https://github.com/Pythagora-io/pythagora" target="_blank">here.</a></p>

<h1>⚙️ Installation</h1>
First install all npm dependencies

```bash
npm install
```

Then you are ready to start server

```bash
node app.js
```
<br><br>
<h1>▶️ Usage</h1>
Server should be now running on <b>http://localhost:3000</b> which means you can start exporting Pythagora tests to Jest. If you are using this in combination with <a href="https://github.com/Pythagora-io/pythagora" target="_blank">Pythagora npm package</a> make sure that inside <b>/src/helpers/api.js</b> you change:

- protocol (if needed)
- hostname
- port

<br><br>
<h1>🗄️ Folder structure </h1>

<ul>
    <li>const</li>
    <li>helpers
        <ul>
            <li>express.js <span style="color: green;">// express middlewares</span></li>
            <li>openai.js <span style="color: green;">// logic for making openai requests and piping back stream data</span></li>
        </ul>
    </li>
    <li>models</li>
    <li>prompts
        <ul>
            <li>generateJestAuth.txt <span style="color: green;">// prompt for generating Jest authentication function</span></li>
            <li>generateJestTest.txt <span style="color: green;">// prompt for generating Jest test from Pythagora test</span></li>
            <li>generateJestTestName.txt <span style="color: green;">// prompt for generating Jest test name</span></li>
        </ul>
    </li>
    <li>routes
        <ul>
            <li>api.js</li>
            <li>auth.js</li>
            <li>index.js</li>
        </ul>
    </li>
    <li>utils</li>
    <li>app.js <span style="color: green;">// file to start server</span></li>
</ul>
<br><br>
<h1 id="connectwithus">🔗 Connect with us</h1>
💬 Join the discussion on <a href="https://discord.gg/npC5TAfj6e" target="_blank">our Discord server</a>.
<br><br>
📨 Get updates on new fetures and beta release by <a href="http://eepurl.com/ikg_nT" target="_blank">adding your email here</a>.
<br><br>
⭐ Star this repo to show support.
<br><br>
