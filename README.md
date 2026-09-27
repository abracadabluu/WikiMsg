# WikiMsg

Ek simple, black background / white text, Wikipedia-style messaging app. Node.js + Express + SQLite backend, plain HTML/CSS/JS frontend — koi build step nahi chahiye.

## Features
- Register (naam, username, password) — username availability real-time check hoti hai
- Login
- Contacts: username search karke kisi ko dhundo, "Add Contact" se add karo
- Start a chat: search + apni existing chats ki list, real-time-ish messaging (har 3 second mein refresh hota hai)
- Post something: text post jo aapke contacts ko bina notification broadcast hoti hai, 12 ghante baad khud expire ho jaati hai, aur aap dekh sakte hain kis-kisne dekha

## Local mein chalane ke liye

```bash
npm install
npm start
```

Fir browser mein `http://localhost:3000` kholo.

## Free server par deploy karna (Render.com)

1. Is poore folder ko GitHub par ek naya repository bana kar push karo.
2. [render.com](https://render.com) par free account banao.
3. Dashboard mein **New +** → **Web Service** click karo, apna GitHub repo connect karo.
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Deploy hone do — kuch minute lagenge. Deploy hone ke baad Render ek URL dega jaise `https://wikimsg.onrender.com` — yahi link apne dosto ko bhej do.

**Dhyan rahe (free tier ki limitations):**
- Render ka free tier kuch der inactivity ke baad "so" jaata hai — pehla request thoda slow (15-30 sec) ho sakta hai jab tak server wake ho.
- Free tier ka disk persistent nahi hota agar app redeploy ho — matlab agar tum code update karke dobara deploy karoge, database (users, messages, posts) reset ho sakta hai. Chalte rehne (bina redeploy) ke dauraan data safe rehta hai.
- Agar tumhe permanent data storage chahiye, Render ka paid "Persistent Disk" add-on use kar sakte ho, ya Railway/Fly.io jaise doosre providers try kar sakte ho jo free persistent disk dete hain.

## Alternative free hosts
Same steps (npm install → npm start) in par bhi kaam karte hain: Railway.app, Cyclic.sh, Glitch.com. Bas build/start command wahi rakhna.

## Project structure
```
wikimsg/
  package.json
  server/
    server.js      # Express API
    db.js           # SQLite schema
  public/
    index.html
    style.css       # black/white Wikipedia theme
    app.js          # frontend logic
```
