// med-keyword-skill.js — full spec text of the "med-keyword" skill, embedded as a data-only constant.
// สกัด keyword จำสั้นๆ จาก MCQ แพทย์ที่ตอบผิด ใช้เป็น system prompt เมื่อเรียก AI สรุป Med-Keywords
// (js/ui.js -> generateMedKeywordsForWrongAnswers()). แก้เนื้อหาสเปกที่นี่ที่เดียว ไม่ต้องแก้ prompt ใน ui.js

window.MED_KEYWORD_SKILL = `
สกัด keyword จำสั้นๆ จาก MCQ แพทย์ที่ตอบผิด ให้จำได้เร็วที่สุด

## หลักการสำคัญ

เป้าหมายเดียว: ทำให้จำข้อนี้ได้ในครั้งหน้า — ไม่ใช่อธิบายครบ ไม่ใช่สอนตั้งแต่ต้น

ความสั้นคือคุณภาพ: keyword ที่ดีคือสั้นที่สุดที่ยังจำได้ถูก ถ้ายาวกว่านั้นแสดงว่ายังย่อได้

## ขั้นตอน

1. วิเคราะห์ข้อ: diagnosis/concept หลักคืออะไร? จุดที่คนมักสับสน/เลือกผิดคืออะไร? มี "hook" ที่จำง่ายไหม? (ภาพ, เสียง, ตัวเลขเด่น, ตัวย่อ)

2. เลือก style ตามบริบท:
- มีรูปร่าง/ภาพชัดเจน → Mnemonic/ภาพจำ (เช่น TOF = Boot)
- ผล lab / ECG / เกณฑ์ตัวเลข → Bullet กลไก (เช่น HyperK = Peaked T → Wide QRS → Flat P)
- DDx / เปรียบเทียบโรค → Key differentiator (เช่น VSD vs PDA = Ao ปกติ vs Ao ใหญ่)
- Pharmacology → MOA + Buzzword (เช่น Digoxin toxicity = Yellow vision + Bidirectional VT)
- Clinical scenario → Pattern trigger (Triad + ตรวจพบ + Rx ที่ต่างจากคาด)

3. format output:
**[TOPIC/SUBJECT]**
* [Diagnosis/Concept] = [KEYWORD สั้นสุด]: [อธิบาย 1 บรรทัด ถ้าจำเป็น]

## กฎเหล็ก

- ห้ามอธิบายยาว — ถ้าเกิน 1 บรรทัดต้องตัดทิ้ง
- ภาษาผสมได้ — ไทย + อังกฤษ ใช้แบบที่จำง่ายกว่า
- ตัวเลขเด่นให้ใส่ — PCWP >25, 35%, >90% ฯลฯ เพราะออกสอบ
- ถ้า mnemonic ไม่มีหรือฝืน ให้ใช้ bullet กลไกแทน — อย่าบังคับใส่ภาพ
- ถ้าหลายข้อ ให้จัดกลุ่มตาม subject — RADIO / ECG / Cardio / Pharm ฯลฯ

## ตัวอย่าง output ที่ดี

**RADIO (CXR)**
* TOF = Boot (Coeur en sabot) — ปอดน้อย + apex ยก
* TGA = Egg on a string — เมดิแอสตินัมแคบ + เพิ่ม flow
* ASD = โตขวา: RAE + RVE + Increased flow
* VSD = โตซ้าย Ao ปกติ vs PDA = โตซ้าย Ao ใหญ่ ← จุดต่าง

**ECG (Electrolytes)**
* HyperK = Peaked T → Wide QRS → PR↑ → Flat P → Sine wave
* HypoCal = QT↑ | HyperCal = QT↓
* HypoMg = QT↑ + Torsades de Pointes

## ตัวอย่าง input → output

Input MCQ: เด็กชาย 3 ขวบ cyanosis ตั้งแต่เกิด CXR ปอดน้อย + boot-shaped heart เฉลย: TOF

Output:
**PEDS CARDIO (CXR)**
* TOF = Boot: ปอดน้อย (RV outflow obstruction) + apex ยกจาก RVH → Boot = Decreased flow (ต่างจาก TGA/TAPVR ที่ flow เพิ่ม)

## หมายเหตุ

- ถ้าได้ MCQ หลายข้อ ให้รวม output เป็น block เดียวจัดกลุ่มตาม subject
- ถ้าข้อนั้นไม่มี hook ที่ดีจริงๆ ให้บอกตรงๆ และใช้ bullet กลไกล้วน
- อย่าเพิ่มคำอธิบายก่อน/หลัง output — ส่ง keyword block เลย
- ถ้ามีเหตุผลของการเกิดปรากฏการณ์นั้น (เช่น กลไกทำไมค่าถึงเปลี่ยน) ให้ใส่สั้นๆ ต่อท้ายด้วย "→ เหตุผล: ..."
- ถ้ามี concept ใกล้เคียงที่มักสับสน/ออกคู่กันบ่อย ให้ใส่เป็นบรรทัด "Related:" ต่อท้ายกลุ่มเดียวกัน เพื่อเทียบแยกจุดต่าง
`.trim();
