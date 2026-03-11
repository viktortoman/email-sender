const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' }); // Átmeneti mappa a feltöltött fájloknak

const PORT = process.env.PORT || 7000;

app.use(bodyParser.json());
// Publikus mappa (public)
app.use(express.static(path.join(__dirname, 'public')));
// Templates mappa publikussá tétele (hogy a képeket elérjük pl. /templates/flora/kep.jpg)
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Konfiguráció beolvasása
function getConfig() {
  const configPath = path.join(__dirname, 'templates', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error("Hiba a config.json olvasásakor:", e);
        return { senders: [], templates: [] };
    }
  }
  return { senders: [], templates: [] };
}

app.get('/get-config', (req, res) => {
  try {
    const config = getConfig();
    // Biztonsági okokból a jelszavakat nem küldjük ki a kliensnek
    const safeConfig = {
      senders: config.senders.map(s => ({ id: s.id, name: s.name, email: s.email })),
      templates: config.templates.map(t => ({
        id: t.id,
        name: t.name,
        // Ha van 'bodies' tömb, azt is elküldjük, ha nincs, kompatibilitás miatt generálunk egyet a régi 'bodyFile'-ból
        bodies: t.bodies ? t.bodies : (t.bodyFile ? [{ id: 'default', name: 'Alapértelmezett', file: t.bodyFile }] : [])
      }))
    };
    res.json(safeConfig);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Konfiguráció beolvasási hiba' });
  }
});

app.get('/get-template-content', (req, res) => {
    const { templateId, bodyId } = req.query;
    const config = getConfig();
    const template = config.templates.find(t => t.id === templateId);

    if (!template) {
        return res.status(404).json({ error: 'Sablon nem található' });
    }

    // HTML sablon betöltése
    const templatePath = path.join(__dirname, 'templates', template.file);
    let html = '';
    try {
        html = fs.readFileSync(templatePath, 'utf8');
    } catch (err) {
        return res.status(500).json({ error: 'HTML fájl nem található' });
    }

    // Szöveges tartalom keresése
    let bodyFile = '';
    
    if (template.bodies && template.bodies.length > 0) {
        // Ha van 'bodies' lista definálva
        const bodyObj = template.bodies.find(b => b.id === bodyId) || template.bodies[0];
        bodyFile = bodyObj.file;
    } else if (template.bodyFile) {
        // Régi struktúra támogatása
        bodyFile = template.bodyFile;
    }

    let bodyContent = '';
    if (bodyFile) {
        const bodyPath = path.join(__dirname, 'templates', bodyFile);
        if (fs.existsSync(bodyPath)) {
            try {
                bodyContent = fs.readFileSync(bodyPath, 'utf8');
            } catch (err) {
                console.error("Hiba a body fájl olvasásakor:", err);
            }
        }
    }

    res.json({ html: html, bodyContent: bodyContent });
});

// A POST kérés multipart/form-data-t fogad a fájlok miatt
app.post('/send-email', upload.array('attachments'), async (req, res) => {
  // A mezők most a req.body-ban vannak, a fájlok a req.files-ban
  const { to, cc, bcc, subject, htmlContent, senderId, templateId } = req.body;
  const files = req.files;

  if (!to || !subject || !htmlContent || !senderId) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const config = getConfig();
  const sender = config.senders.find(s => s.id === senderId);
  const template = config.templates.find(t => t.id === templateId);

  if (!sender) {
    return res.status(400).json({ success: false, message: 'Invalid sender' });
  }

  try {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: sender.email,
        pass: sender.pass,
      },
    });

    // Csatolmányok összeállítása
    let mailAttachments = [];

    // 1. A felhasználó által feltöltött fájlok
    if (files && files.length > 0) {
        files.forEach(file => {
            mailAttachments.push({
                filename: file.originalname,
                path: file.path // A multer ideiglenes útvonala
            });
        });
    }

    // 2. A sablonhoz konfigurált fix csatolmányok (HA lennének ilyenek még)
    // Most kivettük a CID-s logikát, de ha valaki simán csatolni akar fájlt a sablonhoz,
    // az itt maradhat, csak a 'cid' property nélkül.
    if (template && template.attachments) {
        template.attachments.forEach(att => {
            const attPath = path.join(__dirname, 'templates', att.path);
            if (fs.existsSync(attPath)) {
                let attachmentObj = {
                    filename: att.filename,
                    path: attPath
                };
                if(att.cid) attachmentObj.cid = att.cid; // Ha mégis lenne CID

                mailAttachments.push(attachmentObj);
            } else {
                console.warn(`Nem található csatolmány: ${attPath}`);
            }
        });
    }

    let info = await transporter.sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to: to,
      cc: cc,   // Másolat
      bcc: bcc, // Titkos másolat
      subject: subject,
      html: htmlContent,
      attachments: mailAttachments
    });

    console.log('Message sent: %s', info.messageId);

    // Ideiglenes fájlok törlése
    if (files && files.length > 0) {
        files.forEach(file => {
            fs.unlink(file.path, (err) => {
                if (err) console.error("Hiba a temp fájl törlésekor:", err);
            });
        });
    }

    res.json({ success: true, message: 'Email sent successfully!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error sending email', error: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});