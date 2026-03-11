let rawTemplate = "";
let currentTemplateId = "";
let currentSenderId = "";
let currentBodyId = "";

async function loadConfig() {
    try {
        const response = await fetch('/get-config');
        const config = await response.json();

        // 1. Senders feltöltése
        const senderSelect = document.getElementById('senderSelect');
        senderSelect.innerHTML = config.senders.map(sender => `<option value="${sender.id}">${sender.name} (${sender.email})</option>`).join('');
        currentSenderId = config.senders[0]?.id; // Default sender

        // 2. Templates feltöltése
        const templateSelect = document.getElementById('templateSelect');
        // Itt eltároljuk a templates adatokat, hogy később hozzáférjünk a 'bodies' listához
        templateSelect.dataset.templates = JSON.stringify(config.templates); 
        templateSelect.innerHTML = config.templates.map(template => `<option value="${template.id}">${template.name}</option>`).join('');
        
        // 3. Ha van template, töltsük be az elsőt
        if (config.templates.length > 0) {
            currentTemplateId = config.templates[0].id;
            updateBodySelect(config.templates[0]);
            loadTemplateContent(currentTemplateId);
        }

    } catch (error) {
        console.error("Config load error:", error);
        alert("Hiba a konfiguráció betöltésekor: " + error.message);
    }
}

function updateBodySelect(template) {
    const bodySelect = document.getElementById('bodySelect');
    
    // Ha a template-nek vannak definiált 'bodies' elemei
    if (template.bodies && template.bodies.length > 0) {
        bodySelect.innerHTML = template.bodies.map(body => `<option value="${body.id}">${body.name}</option>`).join('');
        bodySelect.disabled = false;
        currentBodyId = template.bodies[0].id;
    } else {
        // Ha nincs, akkor 'Alapértelmezett' vagy üres
        bodySelect.innerHTML = `<option value="default">Alapértelmezett</option>`;
        bodySelect.disabled = true; // Ha nincs választási lehetőség
        currentBodyId = "default";
    }
}

async function loadTemplateContent(templateId, bodyId = null) {
    try {
        // Ha nem adtunk meg bodyId-t, próbáljuk kitalálni a select-ből
        if (!bodyId) {
            bodyId = document.getElementById('bodySelect').value;
        }

        const response = await fetch(`/get-template-content?templateId=${templateId}&bodyId=${bodyId}`);
        if (!response.ok) {
            throw new Error(`HTTP hiba! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data.html) {
            rawTemplate = data.html;

            // Csak akkor írjuk felül a textarea-t, ha ez egy friss betöltés vagy váltás
            document.getElementById('varBody').value = data.bodyContent || ""; 

            renderPreview();
        } else {
            alert("Nem sikerült betölteni a sablont.");
        }
    } catch (error) {
        console.error("Template content load error:", error);
        // document.getElementById('emailPreview').srcdoc = `<div style='padding:20px; font-family:sans-serif; color:red;'>Hiba a tartalom betöltésekor: ${error.message}</div>`;
    }
}

function renderPreview() {
    if (!rawTemplate) return;

    const name = document.getElementById('varName').value || 'Kedves Hölgyem / Uram';
    let bodyText = document.getElementById('varBody').value || '';

    const formattedBody = bodyText.replace(/\n/g, '<br>');

    let finalHtml = rawTemplate
        .replace(/{{NAME}}/g, name)
        .replace(/{{BODY}}/g, formattedBody);
        
    // CID csere törölve - most sima direkt link van a template-ben

    const iframe = document.getElementById('emailPreview');
    const doc = iframe.contentWindow.document;

    doc.open();
    doc.write(finalHtml);
    doc.close();
}

async function sendEmail() {
    const to = document.getElementById('toEmail').value;
    const cc = document.getElementById('ccEmail').value;
    const bcc = document.getElementById('bccEmail').value;
    const subject = document.getElementById('subject').value;
    const btn = document.getElementById('sendBtn');
    const status = document.getElementById('statusMsg');
    const senderSelect = document.getElementById('senderSelect');
    const senderId = senderSelect.value;
    const templateId = document.getElementById('templateSelect').value;
    const filesInput = document.getElementById('fileInput');


    if (!to || !subject) {
        status.innerText = '⚠️ Kérlek töltsd ki a címzettet és a tárgyat!';
        status.className = "text-center text-sm font-medium mt-3 h-5 text-red-600";
        return;
    }

    if (!senderId) {
         status.innerText = '⚠️ Kérlek válassz egy küldőt!';
         status.className = "text-center text-sm font-medium mt-3 h-5 text-red-600";
         return;
    }


    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Küldés folyamatban...`;
    status.innerText = "";

    // FormData használata JSON helyett a fájlok miatt
    const formData = new FormData();
    formData.append('to', to);
    if (cc) formData.append('cc', cc);
    if (bcc) formData.append('bcc', bcc);
    formData.append('subject', subject);
    formData.append('senderId', senderId);
    formData.append('templateId', templateId);
    
    // HTML tartalom generálása
    const name = document.getElementById('varName').value || 'Kedves Hölgyem / Uram';
    let bodyText = document.getElementById('varBody').value || '';
    const formattedBody = bodyText.replace(/\n/g, '<br>');
    let finalHtmlForEmail = rawTemplate
        .replace(/{{NAME}}/g, name)
        .replace(/{{BODY}}/g, formattedBody);
        
    formData.append('htmlContent', finalHtmlForEmail);

    // Fájlok hozzáadása
    if (filesInput.files.length > 0) {
        for (let i = 0; i < filesInput.files.length; i++) {
            formData.append('attachments', filesInput.files[i]);
        }
    }

    try {
        const response = await fetch('/send-email', {
            method: 'POST',
            body: formData // Nem állítunk be Content-Type-ot, a böngésző megteszi a boundary-val
        });

        const result = await response.json();

        if (result.success) {
            status.innerText = "✅ E-mail sikeresen elküldve!";
            status.className = "text-center text-sm font-medium mt-3 h-5 text-green-600";
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        status.innerText = "❌ Hiba: " + err.message;
        status.className = "text-center text-sm font-medium mt-3 h-5 text-red-600";
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>E-mail Küldése</span> <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
    }
}

// Event Listeners

document.getElementById('templateSelect').addEventListener('change', (e) => {
    const templateId = e.target.value;
    const templates = JSON.parse(document.getElementById('templateSelect').dataset.templates || "[]");
    const selectedTemplate = templates.find(t => t.id === templateId);
    
    if (selectedTemplate) {
        updateBodySelect(selectedTemplate);
        loadTemplateContent(templateId);
    }
});

document.getElementById('bodySelect').addEventListener('change', (e) => {
    const bodyId = e.target.value;
    const templateId = document.getElementById('templateSelect').value;
    loadTemplateContent(templateId, bodyId);
});

document.getElementById('varName').addEventListener('input', renderPreview);
document.getElementById('varBody').addEventListener('input', renderPreview);


window.onload = loadConfig;