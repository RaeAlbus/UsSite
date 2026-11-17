# Us

A private website for the two of you, built as tabs. It starts with three:

- **Scores**: daily puzzle scores (Connections, Strands, The Mini, plus any other game), head to head.
- **Calendar**: your shared Google Calendar, embedded.
- **Photos**: a shared gallery. Add photos straight from your iPhone's library or camera.

It's plain HTML, CSS, and JavaScript, so it hosts free on GitHub Pages. Sign-in, the database, and photo storage come from a free Supabase project. Only the two accounts you create can see anything.

## Setup (about 15 minutes)

### 1. Create the project
1. Make a free account at [supabase.com](https://supabase.com) and create a new project.
2. **SQL Editor**: paste in all of `supabase-1-setup.sql` and run it.

### 2. Create your two accounts
1. **Authentication > Users > Add user > Create new user.** Enter an email and password, and tick **Auto Confirm User**. Do this once for each of you.
2. **Authentication > Sign In / Providers** (or "Settings"): turn **off** "Allow new users to sign up", so nobody else can ever create an account.
3. Open `supabase-2-people.sql`, put in your two emails and display names, then run it in the SQL Editor. The name in slot 0 shows on the left of the scoreboard and slot 1 on the right.

### 3. Add the settings table
In the SQL Editor, run `supabase-3-calendar.sql`. The Calendar tab uses it to remember your calendar's link privately.

### 4. Fill in `config.js`
Open **Project Settings > API** and copy the **Project URL** and the **anon / publishable key** into `config.js`. This key is safe to publish, because the database only answers to signed-in users.

### 5. Put it on GitHub Pages
1. Create a GitHub repo and upload everything in this folder, including the `features` folder.
2. **Settings > Pages**: set the source to the `main` branch, root folder, and save.
3. After a minute it's live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

### 6. On your iPhone
Open the link in Safari, sign in, then tap **Share > Add to Home Screen**. You get an icon that opens it like an app, and you stay signed in.

To test on a computer first, run `python3 -m http.server 8000` in this folder and open http://localhost:8000.

## Using it
- **Scores:** finish a puzzle, tap its Share button, and paste into the box. Connections, Strands, and The Mini are read automatically. For any other game, type its name and your score and pick whether lowest or highest wins. The arrows at the top move between days.
- **Calendar:** the first time, paste your calendar's embed code (in Google Calendar on a computer: Settings > your calendar > Integrate calendar > Embed code) or just its Calendar ID. It's saved for both of you, and you can switch between Month, Week, and List views. List is the easiest to read on a phone.
- **Photos:** tap **Add photos** and pick as many as you like. They're shrunk on your phone before uploading, so they're quick. Tap a photo to see it larger, add a caption, fix its date, or delete it. Photos are grouped by the date they were taken (it comes from the file, and you can change it).

## Good to know
- Google Calendar embeds only show calendars the viewer is allowed to see. If yours is private, the embed may come up blank or ask you to sign in, especially in Safari on iPhone, which blocks the cookies Google needs inside embedded frames. If that happens, use the "Open it in Google Calendar" link under the calendar, or in Google Calendar's sharing settings make the calendar visible to the public. Only do that if you're fine with anyone who finds the link seeing your events.
- Photos live in a private bucket and are shown through short-lived links. The free Supabase plan includes 1 GB of storage, which is roughly 2,000 photos at the size this site saves them.
- Photos that your browser can't open (for example HEIC files on a desktop Chrome) are skipped with a message. Picking from the iPhone library in Safari converts them automatically.
- Free Supabase projects pause after a week of no use. If that happens, resume it from the dashboard.

## Adding more to the site
Every tab is one small file in `features/`. To add one:

1. Create `features/yourthing.js`:

```js
(() => {
  const { el } = App.util;

  App.register({
    id: 'letters',            // used in the URL: yoursite/#letters
    label: 'Letters',         // shown on the tab
    mount(panel, ctx) {       // runs once, the first time the tab opens
      panel.append(el('h1', 'page-title', 'Letters'));
      // ctx.sb      -> the Supabase client (database + storage)
      // ctx.me      -> you:  { id, name, slot }
      // ctx.people  -> both of you, left to right
      // ctx.uid     -> your user id
    },
    onShow() {},              // runs every time the tab is opened
    onHide() {},              // runs when you leave it (stop timers here)
  });
})();
```

2. Add `<script src="features/yourthing.js"></script>` to `index.html`, under the other features.
3. If it needs to save things, add a table in the SQL Editor with its rules set to `to authenticated`, like the others in `supabase-1-setup.sql`.

The tab bar, sign-in, and page routing are handled for you.
