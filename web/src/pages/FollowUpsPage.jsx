import FollowUps from '../components/FollowUps.jsx'

export default function FollowUpsPage() {
  return (
    <>
      <div className="head"><h2>Today's follow-ups</h2></div>
      <p className="muted">Open leads whose follow-up is due today or overdue. “Message on WhatsApp” opens a chat with a ready-to-send message; press “Done” afterwards to log it and schedule the next follow-up in 3 days.</p>
      <div className="panel"><FollowUps limit={200} /></div>
    </>
  )
}
