# Monot

Drawing game to play with friends. 

Every round you get 1 of 2 words and have to draw it. Then everyone sorts the drawings into what they think they depict. 

You get a point for each player who correctly sorted your drawing in addition to each player whose drawing you sorted correctly. 

## Project structure

```
server/
  index.js           socket.io event wiring + phase timers (the game "referee")
  rooms.js           room/game state, scoring logic
  easyWordPairs.js   the word pairs used in easy game
  hardWordPairs.js   the word pairs used in a hard game
public/
  index.html     page shell
  style.css      styling
  app.js         client: screens, canvas drawing, socket events
  views          the different html used for the game
  images         images used for the site
package.json
```

## Run locally

```bash
npm install
npm start
```

Then open **http://localhost:3000** in a couple of browser tabs (or on your
phone via your computer's local IP address, e.g. `http://192.168.1.23:3000`)
to test hosting a game in one tab and joining from another.


## Deploy to Render (free tier)

1. Push this project to a GitHub repo.
2. In the Render dashboard, click **New → Web Service** and connect that repo.
3. Render should auto-detect Node. Set:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
4. Choose the **Free** instance type. No environment variables or database
   are needed.
5. Deploy. You'll get a URL like `https://your-app.onrender.com` — that's
   the link everyone opens to host or join a game.

Render's free web services spin down after about 15 minutes with no
traffic, and take roughly a minute to spin back up on the next request.
That only affects the *first* person to open the link after a period of
inactivity — once a game is running, active socket traffic keeps it awake.