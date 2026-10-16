// ==UserScript==
// @name         Call Name HIS
// @namespace    http://tampermonkey.net/
// @version      8.4
// @author       Created by Mr-D
// @description  Call Name HIS (Created by Mr-D) - Hỗ trợ Khám bệnh ngoại trú & Nhà thuốc (Xuất thuốc), tải sẵn danh sách ngầm 0s, đọc rõ từng chữ.
// @match        https://yte-camau.vnpthis.vn/web_his/khambenhngoaitru*
// @match        https://yte-camau.vnpthis.vn/web_his/cmu_funs_nhathuoc_xuatthuoc*
// @match        https://yte-camau.vnpthis.vn/web_his/cmu_funs_nhathuoc_vienphi*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @updateURL    https://github.com/ntdtdt2010-bit/Call-Name-HIS/raw/refs/heads/main/call_name_his.user.js
// @downloadURL  https://github.com/ntdtdt2010-bit/Call-Name-HIS/raw/refs/heads/main/call_name_his.user.js
// ==/UserScript==

(function() {
    'use strict';

    const APP_TITLE = "Call Name HIS v" + GM_info.script.version;
    const APP_AUTHOR = "Created by Mr-D";
    const SERVER_URL = "http://127.0.0.1:5000";

    const IS_PHARMACY_PAGE = window.location.pathname.includes("cmu_funs_nhathuoc_");
    const STORAGE_KEY_ROOM = IS_PHARMACY_PAGE ? "call_name_his_room_pharmacy_v81" : "call_name_his_room_v8";
    const STORAGE_KEY_POS = "call_name_his_pos_v8";

    let selectedPatient = { name: '', stt: '' };
    let preloadedSet = new Set();
    let isEditingRoom = false;

    // Chuyển tên IN HOA ("TRƯƠNG HUYỀN TRANG") thành "Trương Huyền Trang" để giọng AI không đọc lướt đoạn đuôi
    function toTitleCaseVN(str) {
        return str
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    // -------------------------------------------------------------------------
    // 1. QUẢN LÝ TÊN PHÒNG / NHÀ THUỐC
    // -------------------------------------------------------------------------
    function autoDetectRoomFromPage() {
        if (IS_PHARMACY_PAGE) {
            return "nhà thuốc";
        }
        try {
            const topText = document.body ? document.body.innerText.slice(0, 1500) : "";
            const match = topText.match(/đăng nhập vào\s+([^\-\n\r]+)/i);
            if (match && match[1]) {
                let rawRoom = match[1].trim();
                return rawRoom.charAt(0).toLowerCase() + rawRoom.slice(1);
            }
        } catch (err) {}
        return "phòng số 3";
    }

    function getRoomName() {
        const saved = localStorage.getItem(STORAGE_KEY_ROOM);
        if (saved !== null && saved.trim() !== "") {
            return saved.trim();
        }
        return autoDetectRoomFromPage();
    }

    let currentRoom = getRoomName();

    function buildCauDoc(name, stt) {
        const cleanName = toTitleCaseVN(name);
        let text = "Xin mời bệnh nhân " + cleanName;
        if (!IS_PHARMACY_PAGE && stt) {
            text += ", số thứ tự " + stt;
        }
        if (currentRoom && currentRoom.trim() !== "") {
            const dest = currentRoom.trim();
            if (IS_PHARMACY_PAGE) {
                // Tách nhịp bằng dấu chấm để giọng HoaiMyNeural dừng lấy hơi và đọc rõ "vào nhà thuốc"
                text += ". vào " + dest;
            } else {
                text += ", vào " + dest;
            }
        }
        return text;
    }

    // -------------------------------------------------------------------------
    // 2. GIAO DIỆN HỘP THOẠI DỌC GỌN BÊN LỀ PHẢI
    // -------------------------------------------------------------------------
    const oldBox = document.getElementById('his-patient-call-box');
    if (oldBox) oldBox.remove();

    const callBox = document.createElement('div');
    callBox.id = 'his-patient-call-box';
    callBox.style.cssText = `
        position: fixed;
        bottom: 52px;
        right: 8px;
        width: 118px;
        z-index: 999999;
        background: #ffffff;
        border: 2px solid #28a745;
        border-radius: 10px;
        padding: 8px 8px 9px 8px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.22);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 7px;
        font-family: Arial, sans-serif;
        user-select: none;
        box-sizing: border-box;
    `;

    try {
        const savedPos = JSON.parse(localStorage.getItem(STORAGE_KEY_POS) || "null");
        if (savedPos && typeof savedPos.top === "number" && typeof savedPos.right === "number") {
            callBox.style.bottom = "auto";
            callBox.style.top = Math.max(10, Math.min(window.innerHeight - 220, savedPos.top)) + "px";
            callBox.style.right = Math.max(4, Math.min(window.innerWidth - 125, savedPos.right)) + "px";
        }
    } catch (e) {}

    callBox.innerHTML = `
        <div id="his-drag-header" title="Giữ chuột để kéo vị trí" style="cursor: move; border-bottom: 1px dashed #d8e6da; padding-bottom: 5px; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <span style="font-size: 10.5px; font-weight: bold; color: #1e7e34; line-height: 1.2;">
                    ${APP_TITLE}
                </span>
                <span id="his-server-dot" title="Đang kiểm tra kết nối Server..." style="font-size: 9px; cursor: help;">⚪</span>
            </div>
            <div style="font-size: 9.5px; color: #6c757d; font-style: italic; margin-top: 2px;">
                ${APP_AUTHOR}
            </div>
        </div>

        <div id="his-call-info" style="background: #f4f9f5; border: 1px solid #d4edda; border-radius: 6px; padding: 6px 4px; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; word-break: break-word;">
            <span style="font-size: 11.5px; font-weight: bold; color: #6c757d; line-height: 1.25;">
                Chưa chọn<br>bệnh nhân
            </span>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <div id="his-room-view" style="width: 100%; text-align: center;">
                <div id="his-room-label" title="Bấm vào đây để đổi số phòng/nhà thuốc" style="color: #155724; background: #d4edda; padding: 4px 4px; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer; border: 1px solid #c3e6cb; word-break: break-word; line-height: 1.25;">
                    📍 ${currentRoom} ✏️
                </div>
            </div>
            <div id="his-room-edit" style="display: none; flex-direction: column; width: 100%; gap: 4px;">
                <input type="text" id="his-room-input" style="width: 100%; box-sizing: border-box; font-size: 11px; padding: 3px 4px; border: 1px solid #007bff; border-radius: 4px; text-align: center; outline: none;" placeholder="VD: nhà thuốc" />
                <button id="his-room-save" style="width: 100%; background: #007bff; color: #fff; border: none; border-radius: 4px; padding: 3px 0; font-size: 11px; cursor: pointer; font-weight: bold;">Lưu phòng</button>
            </div>
            <div style="font-size: 10.5px; color: #555; text-align: center;">
                Phím tắt: <b style="color: #d9534f;">F2</b>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100%;">
            <button id="his-btn-speak" style="width: 100%; background-color: #28a745; color: white; border: none; padding: 9px 4px; font-weight: bold; font-size: 13.5px; border-radius: 6px; cursor: pointer; transition: background 0.15s; box-shadow: 0 2px 5px rgba(40,167,69,0.3);">
                🔊 GỌI
            </button>
            <span id="his-queue-status" style="font-size: 9.5px; color: #007bff; font-weight: bold; text-align: center; display: none;"></span>
        </div>
    `;
    document.body.appendChild(callBox);

    const dragHeader = document.getElementById('his-drag-header');
    const btnSpeak = document.getElementById('his-btn-speak');
    const infoText = document.getElementById('his-call-info');
    const serverDot = document.getElementById('his-server-dot');
    const queueStatus = document.getElementById('his-queue-status');
    const roomView = document.getElementById('his-room-view');
    const roomLabel = document.getElementById('his-room-label');
    const roomEdit = document.getElementById('his-room-edit');
    const roomInput = document.getElementById('his-room-input');
    const roomSave = document.getElementById('his-room-save');

    let isDragging = false, dragStartY = 0, dragStartX = 0, boxStartTop = 0, boxStartRight = 0;

    dragHeader.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = callBox.getBoundingClientRect();
        dragStartY = e.clientY;
        dragStartX = e.clientX;
        boxStartTop = rect.top;
        boxStartRight = window.innerWidth - rect.right;
        callBox.style.bottom = 'auto';
        callBox.style.top = boxStartTop + 'px';
        callBox.style.right = boxStartRight + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const newTop = Math.max(10, Math.min(window.innerHeight - callBox.offsetHeight - 10, boxStartTop + (e.clientY - dragStartY)));
        const newRight = Math.max(4, Math.min(window.innerWidth - callBox.offsetWidth - 4, boxStartRight - (e.clientX - dragStartX)));
        callBox.style.top = newTop + 'px';
        callBox.style.right = newRight + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            const rect = callBox.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({
                top: rect.top,
                right: window.innerWidth - rect.right
            }));
        }
    });

    roomLabel.addEventListener('click', function(e) {
        e.stopPropagation();
        isEditingRoom = true;
        roomInput.value = currentRoom;
        roomView.style.display = 'none';
        roomEdit.style.display = 'flex';
        roomInput.focus();
        roomInput.select();
    });

    function saveRoomChange() {
        const val = roomInput.value.trim();
        if (val !== "") {
            currentRoom = val;
            localStorage.setItem(STORAGE_KEY_ROOM, currentRoom);
        } else {
            localStorage.removeItem(STORAGE_KEY_ROOM);
            currentRoom = autoDetectRoomFromPage();
        }
        roomLabel.innerText = `📍 ${currentRoom} ✏️`;
        roomEdit.style.display = 'none';
        roomView.style.display = 'block';
        isEditingRoom = false;

        preloadedSet.clear();
        if (selectedPatient.name) {
            preloadSinglePatient(selectedPatient.name, selectedPatient.stt);
        }
        scanAndBatchPreload();
    }

    roomSave.addEventListener('click', function(e) {
        e.stopPropagation();
        saveRoomChange();
    });

    roomInput.addEventListener('keydown', function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            saveRoomChange();
        } else if (e.key === 'Escape') {
            roomEdit.style.display = 'none';
            roomView.style.display = 'block';
            isEditingRoom = false;
        }
    });

    // -------------------------------------------------------------------------
    // 3. BÓC TÁCH SIÊU TỐC: CHỈ QUÉT ĐÚNG BẢNG #contenttabledanhsachPhieuKhoDuoc
    // -------------------------------------------------------------------------
    const INVALID_NAME_KEYWORDS = [
        "họ tên", "tên bn", "mã đơn", "mã y tế", "địa chỉ", "đối tượng", "mạch", "nhiệt độ",
        "creatinin", "nhóm máu", "kết quả", "kq nhận định", "cđ tuyến trước",
        "khám dịch vụ", "lý do", "triệu chứng", "giai đoạn", "chẩn đoán",
        "bệnh phụ", "lời dặn", "danh sách bệnh nhân", "kiểm tra", "giờ tiếp nhận",
        "thành tiền", "chuyển khoản", "đã chuyển", "đã khóa", "không có dữ liệu", "ra toa"
    ];

    function isValidVietnameseName(str, allowSingleWord = false) {
        if (!str || str.length < 2 || str.length > 65) return false;
        if (str.includes(':') || str.includes('\n') || str.includes('\t')) return false;
        if (/[0-9=_+/*<>@#$%^&()[\]{}|\\~`]/.test(str)) return false;

        const lower = str.toLowerCase().trim();
        for (const kw of INVALID_NAME_KEYWORDS) {
            if (lower === kw || lower.startsWith(kw + " ")) return false;
        }
        if (!allowSingleWord && !lower.includes(' ')) return false;
        return true;
    }

    // NHÁNH NHÀ THUỐC (XUẤT THUỐC & VIỆN PHÍ):
    // Bắt trực tiếp từ dòng #row...danhsachPhieuKhoDuoc -> lấy ô thứ 2 (cột Tên BN)
    function extractFromPharmacyRow(rowDiv) {
        if (!rowDiv || !rowDiv.id || !rowDiv.id.includes("danhsachPhieuKhoDuoc")) return null;

        // Cột Tên BN nằm ở div[role="gridcell"] thứ 2 (index 1) và có class .jqx-grid-cell-left-align
        const gridCells = rowDiv.querySelectorAll('div[role="gridcell"]');
        if (gridCells.length >= 2) {
            const nameCellText = gridCells[1].textContent.trim();
            if (isValidVietnameseName(nameCellText, true)) {
                return { name: nameCellText, stt: '' };
            }
        }

        // Dự phòng quét các ô căn trái trong dòng đó
        const leftCells = rowDiv.querySelectorAll('.jqx-grid-cell-left-align');
        for (let i = 0; i < leftCells.length; i++) {
            const txt = leftCells[i].textContent.trim();
            if (isValidVietnameseName(txt, true)) {
                return { name: txt, stt: '' };
            }
        }
        return null;
    }

    // NHÁNH PHÒNG KHÁM: Giữ nguyên 100% logic v8.2 gốc
    function isRowInsidePatientList(tr) {
        if (tr.querySelector('input:not([type="checkbox"]):not([type="hidden"]), select, textarea, button')) {
            return false;
        }
        const rect = tr.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        if (rect.left > window.innerWidth * 0.48) return false;

        const table = tr.closest('table');
        if (!table) return false;

        let container = table.parentElement;
        for (let i = 0; i < 6 && container; i++) {
            const textSample = (container.innerText || "").slice(0, 300);
            if (textSample.includes("Danh sách bệnh nhân") || (textSample.includes("Họ tên") && textSample.includes("STT"))) {
                return true;
            }
            container = container.parentElement;
        }
        return false;
    }

    function extractFromClinicRow(tr) {
        if (!tr || !isRowInsidePatientList(tr)) return null;

        const visibleTds = Array.from(tr.querySelectorAll('td')).filter(td => {
            const style = window.getComputedStyle(td);
            return style.display !== 'none' && style.visibility !== 'hidden' && td.offsetWidth > 0;
        });

        if (visibleTds.length < 3) return null;
        if (visibleTds[0].querySelector('input, button, select, textarea, a')) return null;

        const nameCandidate = visibleTds[0].innerText.trim();
        const sttCandidate = visibleTds[1].innerText.trim();

        if (!isValidVietnameseName(nameCandidate, false)) return null;
        if (!/^\d{1,5}$/.test(sttCandidate)) return null;

        return { name: nameCandidate, stt: sttCandidate };
    }

    // -------------------------------------------------------------------------
    // 4. SỰ KIỆN CHỌN BỆNH NHÂN (0ms) & GỌI LOA
    // -------------------------------------------------------------------------
    document.addEventListener('click', function(e) {
        if (callBox.contains(e.target)) return;
        if (e.target.closest('button, input:not([type="checkbox"]), select, textarea, a')) return;

        let patient = null;
        if (IS_PHARMACY_PAGE) {
            const rowDiv = e.target.closest('div[role="row"]');
            if (rowDiv) patient = extractFromPharmacyRow(rowDiv);
        } else {
            const tr = e.target.closest('tr');
            if (tr) patient = extractFromClinicRow(tr);
        }

        if (patient) {
            selectedPatient.name = patient.name;
            selectedPatient.stt = patient.stt;

            infoText.innerHTML = `
                <div style="font-size: 12px; font-weight: bold; color: #0056b3; line-height: 1.25;">
                    ${patient.name}
                </div>
                ${patient.stt ? `
                <div style="font-size: 11.5px; font-weight: bold; color: #d9534f; background: #fff0f0; padding: 1px 6px; border-radius: 4px; border: 1px solid #f5c6cb;">
                    STT: ${patient.stt}
                </div>` : ''}
            `;
            preloadSinglePatient(patient.name, patient.stt);
        }
    }, true);

    function preloadSinglePatient(name, stt) {
        const cauDoc = buildCauDoc(name, stt);
        if (!preloadedSet.has(cauDoc) && typeof GM_xmlhttpRequest !== 'undefined') {
            preloadedSet.add(cauDoc);
            GM_xmlhttpRequest({
                method: "POST",
                url: SERVER_URL + "/preload_batch",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ items: [cauDoc] })
            });
        }
    }

    function updateQueueUI(playingText, waitingCount) {
        if (waitingCount > 0) {
            btnSpeak.style.backgroundColor = "#007bff";
            btnSpeak.innerText = `🔊 ĐỌC (${waitingCount})`;
            queueStatus.style.display = "block";
            queueStatus.innerText = `Chờ đọc: ${waitingCount}`;
        } else if (playingText) {
            btnSpeak.style.backgroundColor = "#17a2b8";
            btnSpeak.innerText = "🔊 ĐANG ĐỌC";
            queueStatus.style.display = "none";
        } else {
            btnSpeak.style.backgroundColor = "#28a745";
            btnSpeak.innerText = "🔊 GỌI";
            queueStatus.style.display = "none";
        }
    }

    function triggerCall() {
        if (!selectedPatient.name) {
            alert("⚠️ Bạn chưa bấm chọn bệnh nhân nào trong danh sách!");
            return;
        }

        const cauDoc = buildCauDoc(selectedPatient.name, selectedPatient.stt);
        btnSpeak.style.backgroundColor = "#17a2b8";
        btnSpeak.innerText = "🔊 ĐANG GỬI";

        GM_xmlhttpRequest({
            method: "POST",
            url: SERVER_URL + "/speak",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ text: cauDoc }),
            timeout: 10000,
            onload: function(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    serverDot.innerText = "🟢";
                    serverDot.title = `${APP_TITLE} (${APP_AUTHOR}) đang hoạt động tốt`;
                    updateQueueUI(data.playing, data.waiting_count || 0);
                } catch (err) {
                    btnSpeak.style.backgroundColor = "#28a745";
                    btnSpeak.innerText = "🔊 GỌI";
                }
            },
            onerror: function() {
                serverDot.innerText = "🔴";
                serverDot.title = `Chưa bật phần mềm ${APP_TITLE} (Call_Name_HIS_v8.2.exe)`;
                btnSpeak.style.backgroundColor = "#dc3545";
                btnSpeak.innerText = "🔊 LỖI";
                alert(`⚠️ Không kết nối được với phần mềm chạy ngầm ${APP_TITLE} (Call_Name_HIS_v8.2.exe)!\nVui lòng kiểm tra xem phần mềm đã được bật chưa.`);
            }
        });
    }

    btnSpeak.addEventListener('click', function(e) {
        e.stopPropagation();
        triggerCall();
    });

    document.addEventListener('keydown', function(e) {
        if (isEditingRoom) return;
        if (e.key === 'F2') {
            e.preventDefault();
            triggerCall();
        }
    });

    // -------------------------------------------------------------------------
    // 5. QUÉT TẢI NGẦM DANH SÁCH SIÊU NHANH
    // -------------------------------------------------------------------------
    function scanAndBatchPreload() {
        if (!localStorage.getItem(STORAGE_KEY_ROOM) && !isEditingRoom) {
            const detected = autoDetectRoomFromPage();
            if (detected && detected !== currentRoom) {
                currentRoom = detected;
                roomLabel.innerText = `📍 ${currentRoom} ✏️`;
            }
        }

        const newItems = [];

        if (IS_PHARMACY_PAGE) {
            // Chỉ quét gọn bên trong bảng #contenttabledanhsachPhieuKhoDuoc (tốc độ < 1ms)
            const gridContainer = document.getElementById('contenttabledanhsachPhieuKhoDuoc');
            if (gridContainer) {
                const rows = gridContainer.querySelectorAll('div[role="row"]');
                rows.forEach(r => {
                    const patient = extractFromPharmacyRow(r);
                    if (patient) {
                        const cauDoc = buildCauDoc(patient.name, '');
                        if (!preloadedSet.has(cauDoc)) {
                            preloadedSet.add(cauDoc);
                            newItems.push(cauDoc);
                        }
                    }
                });
            }
        } else {
            const rows = document.querySelectorAll('tr');
            rows.forEach(tr => {
                const patient = extractFromClinicRow(tr);
                if (patient) {
                    const cauDoc = buildCauDoc(patient.name, patient.stt);
                    if (!preloadedSet.has(cauDoc)) {
                        preloadedSet.add(cauDoc);
                        newItems.push(cauDoc);
                    }
                }
            });
        }

        if (newItems.length > 0 && typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: "POST",
                url: SERVER_URL + "/preload_batch",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ items: newItems })
            });
        }
    }

    function checkServerStatus() {
        if (typeof GM_xmlhttpRequest === 'undefined') return;
        GM_xmlhttpRequest({
            method: "GET",
            url: SERVER_URL + "/status",
            timeout: 2000,
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        serverDot.innerText = "🟢";
                        serverDot.title = `${APP_TITLE} (${APP_AUTHOR}) đang sẵn sàng`;
                        updateQueueUI(data.playing, data.waiting_count || 0);
                    } catch (e) {}
                } else {
                    serverDot.innerText = "🔴";
                }
            },
            onerror: function() {
                serverDot.innerText = "🔴";
                serverDot.title = `${APP_TITLE} chưa chạy`;
                btnSpeak.style.backgroundColor = "#28a745";
                btnSpeak.innerText = "🔊 GỌI";
                queueStatus.style.display = "none";
            }
        });
    }

    setTimeout(scanAndBatchPreload, 500);
    setInterval(scanAndBatchPreload, 2500);
    setInterval(checkServerStatus, 1500);
    setTimeout(checkServerStatus, 500);
})();
