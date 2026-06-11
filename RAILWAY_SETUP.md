# Railway account-system setup

The classroom login system and Road to the Super Bowl math game require a Railway PostgreSQL database and a bootstrap teacher account.

## 1. Add PostgreSQL

In the Railway project, click **New** and add **PostgreSQL**.

Railway should automatically make `DATABASE_URL` available to the NFL web service. If it does not, add a service variable referencing the PostgreSQL service's `DATABASE_URL`.

## 2. Add teacher variables

Add these variables to the NFL web service:

- `TEACHER_USERNAME`: the teacher login username, such as `teacher`
- `TEACHER_PIN`: a private 4-8 digit PIN
- `TEACHER_DISPLAY_NAME`: optional teacher display name
- `NODE_ENV`: `production`

Do not share the teacher PIN with students.

## 3. Deploy

Redeploy the NFL web service. On startup, the app creates its database tables, creates the first teacher account if it does not already exist, and prepares the math game leaderboard.

Visit `/login` to sign in. Teachers are sent to `/teacher`, where they can create student usernames and PINs. Students can play Road to the Super Bowl from the Math Lab page. XP, yards, touchdowns, streaks, and leaderboard results are saved automatically.

## Stored classroom data

The app stores only:

- Teacher-created username and display name
- Securely hashed PIN
- Selected NFL team
- Pages viewed and time spent
- Pages marked complete
- Math game XP, progress, answers, and leaderboard results
- Last login/activity time

No student email addresses are collected.
