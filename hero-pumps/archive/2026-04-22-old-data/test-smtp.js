const nodemailer = require('/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/node_modules/nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.qiye.aliyun.com',
  port: 465,
  secure: true,
  auth: {
    user: 'sales@heropumps.com.cn',
    pass: 'xCxoAELWyxue5GMg'
  }
});

async function main() {
  console.log('Testing Hero Pumps SMTP connection...');
  
  try {
    await transporter.verify();
    console.log('✅ SMTP 连接成功');
    
    const info = await transporter.sendMail({
      from: 'sales@heropumps.com.cn',
      to: 'sale-9@farreach-electronic.com',
      subject: 'Hero Pumps 测试邮件',
      text: '这是来自 Hero Pumps 阿里邮箱的测试邮件。\n\n如果收到此邮件，说明 SMTP 配置正常。\n\n---\nJaden Yeung\nHero Pump Co., Ltd'
    });
    
    console.log('✅ 邮件已发送:', info.messageId);
  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  }
}

main();
