import nodemailer from 'nodemailer';

// Gmail credentials stay in the Netlify function environment. Neither request
// input nor a registration can choose the SMTP host, sender or envelope.
export function gmailTransportOptions(config){
  return {host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:config.gmailUser,pass:config.gmailPassword},
    tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:5000,greetingTimeout:5000,dnsTimeout:5000,socketTimeout:8000,
    disableFileAccess:true,disableUrlAccess:true,maxRecipients:1,
    logger:false,debug:false,transactionLog:false};
}
export async function sendGmailRegistration(config,job,message,createTransport=options=>nodemailer.createTransport(options)){
  const transport=createTransport(gmailTransportOptions(config));
  try{
    const result=await transport.sendMail({...message,from:config.from,to:[job.recipient],
      envelope:{from:config.gmailUser,to:[job.recipient]},
      messageId:`<vpo-registration.${job.id}@gmail.com>`,
      disableFileAccess:true,disableUrlAccess:true});
    if(!result.accepted?.some(address=>String(address).toLowerCase()===job.recipient.toLowerCase())||typeof result.messageId!=='string'||!result.messageId)throw new Error('SMTP did not accept the notification');
    return result.messageId;
  }finally{transport.close();}
}
