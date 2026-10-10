const clean = value => String(value || '').replace(/[\r\n]/g, ' ');
const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = line => { let result='', part=''; for(const char of line) { if(new TextEncoder().encode(part+char).length>73) {result+=part+'\r\n ';part='';} part+=char;} return result+part; };
export function prepareMail(job, sender) {
 const m=job.payload, cancelled=job.event==='cancelled';
 const label=job.event.startsWith('reminder')?'Reminder':({scheduled:'Scheduled',updated:'Updated',cancelled:'Cancelled',completed:'Completed'}[job.event] || 'Meeting');
 const time=new Date(m.starts_at).toLocaleString('en-US',{timeZone:'America/Indiana/Indianapolis',dateStyle:'full',timeStyle:'short'});
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Schedlr//CVOA meetings//EN',`METHOD:${cancelled?'CANCEL':'REQUEST'}`,'BEGIN:VEVENT',`UID:${m.id}@schedlr.cvoa.one`,`SEQUENCE:${job.version}`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(m.starts_at)}`,`DTEND:${stamp(m.ends_at)}`,`SUMMARY:${escapeIcs(m.title)}`,`LOCATION:${escapeIcs(m.location)}`,`DESCRIPTION:${escapeIcs(m.description)}`,`ORGANIZER:mailto:${m.organizer_email}`,`ATTENDEE;RSVP=TRUE:mailto:${job.recipient}`,`STATUS:${cancelled?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR'];
 return {from:`CVOA Scheduling <${sender}>`,replyTo:m.organizer_email,to:job.recipient,
  messageId:`<${job.id}@schedlr.cvoa.one>`,subject:`${label}: ${clean(m.title)}`,
  text:`${label}: ${m.title}\n\nWhen: ${time} Eastern Time\nEnds: ${new Date(m.ends_at).toLocaleString('en-US',{timeZone:'America/Indiana/Indianapolis'})} Eastern Time\nWhere: ${m.location || 'Organizer will provide details'}\n\n${m.description || ''}\n\nOrganizer: ${m.organizer_email}\nReply to the organizer with questions. Your calendar attachment uses the same event identity for updates and cancellations.\n\nManage your own meetings in CVOA.ONE: https://cvoa.one/schedlr`,
  icalEvent:{filename:'meeting.ics',method:cancelled?'CANCEL':'REQUEST',content:lines.map(fold).join('\r\n')+'\r\n'}
 };
}
