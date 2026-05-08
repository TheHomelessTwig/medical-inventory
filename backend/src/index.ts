import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`S.H.I.T. API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start scheduled jobs (not in test)
  if (process.env.NODE_ENV !== 'test') {
    import('./jobs/scheduledReports').then(({ startScheduledReports }) => {
      startScheduledReports();
    }).catch(console.error);
  }
});

export default app;
