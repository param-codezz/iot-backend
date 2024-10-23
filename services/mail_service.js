const nodemailer = require('nodemailer');
require('dotenv').config();

const sendMail = async (recipientEmail, subject, text, html = null) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', 
        auth: {
            user: process.env.MAIL, 
            pass: process.env.MAIL_PASSWORD
        }
    });

    try {
        const mailOptions = {
            from: process.env.MAIL,     
            to: recipientEmail,                
            subject: subject,                
            text: text,                        
        };

        let info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.response}`);
    } catch (error) {
        console.error(`Error sending email: ${error}`);
    }
};

module.exports = sendMail;