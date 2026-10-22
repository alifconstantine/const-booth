(function () {

    function isUsableImageDataUrl(s) {
        if (!s || typeof s !== "string") return false;
        if (s.indexOf("data:image") !== 0) return false;
        if (s.length <= 32) return false;
        var comma = s.indexOf(",");
        if (comma < 0) return false;
        var head = s.slice(comma + 1, comma + 32);
        return (
            head.indexOf("R0lGODlhAQAB") === -1 &&
            head.indexOf("AQABAIAAAAAAAP") === -1
        );
    }

    function resizeImageForCanvas(file, maxDim) {
        maxDim = maxDim || 1200;
        return new Promise(function (resolve, reject) {

            if (typeof createImageBitmap === "function") {
                createImageBitmap(file).then(function (bmp) {
                    var w = bmp.width, h = bmp.height;

                    if (w <= maxDim && h <= maxDim) {

                        var reader = new FileReader();
                        reader.onload = function (e) {

                            if (!isUsableImageDataUrl(e.target.result)) {
                                try { bmp.close && bmp.close(); } catch(e) {}
                                reject(new Error("corrupted"));
                                return;
                            }
                            try { bmp.close && bmp.close(); } catch(e) {}
                            resolve(e.target.result);
                        };
                        reader.onerror = function () {
                            try { bmp.close && bmp.close(); } catch(e) {}
                            reject(new Error("read"));
                        };
                        reader.readAsDataURL(file);
                        return;
                    }
                    var scale = Math.min(maxDim / w, maxDim / h, 1);
                    var nw = Math.round(w * scale), nh = Math.round(h * scale);
                    var cv = document.createElement("canvas");
                    cv.width = nw; cv.height = nh;
                    var ctx = cv.getContext("2d");
                    if (!ctx) {
                        try { bmp.close && bmp.close(); } catch(e) {}
                        reject(new Error("ctx"));
                        return;
                    }
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(bmp, 0, 0, nw, nh);
                    try { bmp.close && bmp.close(); } catch(e) {}

                    var result = cv.toDataURL("image/jpeg", 0.92);

                    if (!isUsableImageDataUrl(result)) {
                        reject(new Error("corrupted"));
                        return;
                    }
                    resolve(result);
                }).catch(function () {

                    resizeViaImage(file, maxDim, resolve, reject);
                });
                return;
            }

            resizeViaImage(file, maxDim, resolve, reject);
        });
    }

    function resizeViaImage(file, maxDim, resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        var timeoutId = null;
        var loaded = false;

        timeoutId = setTimeout(function() {
            if (!loaded) {
                URL.revokeObjectURL(url);
                loaded = true;

                fallbackToFileReader(file, resolve, reject);
            }
        }, 10000);

        img.onload = function () {
            if (loaded) return;
            loaded = true;
            clearTimeout(timeoutId);
            URL.revokeObjectURL(url);

            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            if (!w || !h) {
                fallbackToFileReader(file, resolve, reject);
                return;
            }

            try {
                var scale = Math.min(maxDim / w, maxDim / h, 1);
                var nw = Math.round(w * scale), nh = Math.round(h * scale);
                var cv = document.createElement("canvas");
                cv.width = nw; cv.height = nh;
                var ctx = cv.getContext("2d");
                if (!ctx) {
                    fallbackToFileReader(file, resolve, reject);
                    return;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, nw, nh);

                var result = cv.toDataURL("image/jpeg", 0.92);

                if (!isUsableImageDataUrl(result)) {
                    fallbackToFileReader(file, resolve, reject);
                    return;
                }
                resolve(result);
            } catch (e) {
                fallbackToFileReader(file, resolve, reject);
            }
        };

        img.onerror = function () {
            if (loaded) return;
            loaded = true;
            clearTimeout(timeoutId);
            URL.revokeObjectURL(url);
            fallbackToFileReader(file, resolve, reject);
        };

        img.src = url;
    }

    function fallbackToFileReader(file, resolve, reject) {

        var reader = new FileReader();
        reader.onload = function (e) {
            if (isUsableImageDataUrl(e.target.result)) {
                resolve(e.target.result);
            } else {
                reject(new Error("empty"));
            }
        };
        reader.onerror = function () { reject(new Error("read")); };
        reader.readAsDataURL(file);
    }

    function init() {

        const cameraSection = document.querySelector(".camera-section");
        if (cameraSection && cameraSection.classList.contains("shared-layout")) return;

        const originalCaptureBtn = document.getElementById("capture-btn");
        const addBtn = document.getElementById("frame-add-photos");
        const fileInput = document.getElementById("frame-photo-upload");
        const nativeStripPreview = document.getElementById("strip-preview");

        if (!originalCaptureBtn || !addBtn || !fileInput || !nativeStripPreview) {
            console.error("frame-upload.js: Missing required elements");
            return;
        }

        addBtn.classList.add("desktop-add-photos-btn");

        let customStripPreview = document.getElementById("custom-strip-preview");
        if (!customStripPreview) {
            customStripPreview = document.createElement("div");
            customStripPreview.id = "custom-strip-preview";
            customStripPreview.className = "custom-upload-strip-preview";
            nativeStripPreview.parentNode.insertBefore(customStripPreview, nativeStripPreview.nextSibling);
        }

        const generateBtn = originalCaptureBtn.cloneNode(true);
        generateBtn.id = "custom-frame-generate-btn";
        generateBtn.style.display = "none";
        generateBtn.style.setProperty("order", "2", "important");
        originalCaptureBtn.parentNode.insertBefore(generateBtn, originalCaptureBtn.nextSibling);

        const btnMain = generateBtn.querySelector(".btn-main");

        let isUploadMode = false;
        let uploadedImages = [];
        let requiredPhotos = 1;
        let activeIndex = 0;

        function getICFramePhotoCount() {
            const counts = { single: 1, double: 2, triple: 3, grid: 4 };
            const layout = localStorage.getItem("cardLayout") || "single";
            return counts[layout] || 1;
        }

        function updateGenerateBtnState(allFilled) {
            generateBtn.style.display = "flex";
            originalCaptureBtn.style.setProperty("display", "none", "important");

            if (btnMain) {
                const validImageCount = uploadedImages.filter(isUsableImageDataUrl).length;
                const trulyAllFilled = validImageCount === requiredPhotos;

                if (trulyAllFilled) {
                    generateBtn.classList.remove("disabled");
                    btnMain.disabled = false;
                    btnMain.removeAttribute("disabled");
                    btnMain.setAttribute("aria-disabled", "false");
                } else {
                    generateBtn.classList.add("disabled");
                    btnMain.disabled = true;
                    btnMain.setAttribute("aria-disabled", "true");
                }
                btnMain.innerHTML = `<span class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span><span>Generate Frame</span>`;
            }
        }

        function restoreOriginalCaptureBtn() {
            generateBtn.style.display = "none";
            generateBtn.style.setProperty("display", "none", "important");
            originalCaptureBtn.style.removeProperty("display");
        }

        function renderSlots() {
            customStripPreview.innerHTML = "";
            for (let i = 0; i < requiredPhotos; i++) {
                const box = document.createElement("div");
                box.className = "upload-placeholder";

                const isValidImage = isUsableImageDataUrl(uploadedImages[i]);

                if (isUploadMode && isValidImage) {
                    box.classList.add("filled");
                    const img = document.createElement("img");
                    img.src = uploadedImages[i];
                    box.appendChild(img);
                    const x = document.createElement("div");
                    x.className = "remove-label";
                    x.textContent = "✕";
                    box.appendChild(x);
                } else {
                    const num = document.createElement("span");
                    num.className = "placeholder-num";
                    num.textContent = String(i + 1);
                    box.appendChild(num);
                }

                const slotIndex = i;
                box.addEventListener("click", () => {
                    if (!isUploadMode) return;
                    if (uploadedImages[slotIndex]) {
                        uploadedImages[slotIndex] = null;
                        renderSlots();
                        updateGenerateBtnState(false);
                    } else {
                        activeIndex = slotIndex;
                        fileInput.click();
                    }
                });

                customStripPreview.appendChild(box);
            }
        }

        function reset() {
            isUploadMode = false;
            uploadedImages = [];
            activeIndex = 0;

            if (cameraSection) {
                cameraSection.classList.remove("custom-upload-active");
                cameraSection.style.display = "";
                cameraSection.classList.add("visible");
            }

            document.body.classList.remove("ic-output-open", "preview-visible");

            const icScreen = document.getElementById("ic-output-screen");
            if (icScreen) {
                icScreen.classList.remove("visible");
                icScreen.style.display = "none";
            }

            const previewScreen = document.querySelector(".preview-screen");
            if (previewScreen) {
                previewScreen.classList.remove("visible");
                previewScreen.style.display = "none";
            }

            if (addBtn) {
                addBtn.classList.remove("upload-active");
                addBtn.style.removeProperty("display");
            }

            restoreOriginalCaptureBtn();

            if (customStripPreview) {
                customStripPreview.innerHTML = "";
                customStripPreview.removeAttribute("style");
                customStripPreview.classList.remove("upload-mode-active");
            }

            if (nativeStripPreview) {
                nativeStripPreview.style.display = "";
            }

            if (typeof window.__lbClearPhotoArrays === "function") window.__lbClearPhotoArrays("retake");

            window.dispatchEvent(new Event("resize"));
        }

        let filePickerOpened = false;

        addBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (document.body.classList.contains("is-capturing") || window._isCapturing) return;

            if (document.querySelector(".camera-section.shared-layout")) return;

            if (!isUploadMode) {
                isUploadMode = true;
                requiredPhotos = getICFramePhotoCount();
                uploadedImages = new Array(requiredPhotos).fill(null);

                if (cameraSection) {
                    cameraSection.classList.add("custom-upload-active");
                }

                updateGenerateBtnState(false);

                nativeStripPreview.style.display = "none";
                customStripPreview.removeAttribute("style");
                customStripPreview.classList.add("upload-mode-active");
                renderSlots();

                activeIndex = 0;
                filePickerOpened = true;
                fileInput.click();
            } else {
                const emptyIndex = uploadedImages.indexOf(null);
                if (emptyIndex !== -1) {
                    activeIndex = emptyIndex;
                    filePickerOpened = true;
                    fileInput.click();
                }
            }
        });

        fileInput.addEventListener("cancel", () => {
            filePickerOpened = false;
            if (isUploadMode) reset();
        });

        window.addEventListener("focus", () => {
            if (filePickerOpened) {
                setTimeout(() => {
                    if (filePickerOpened && isUploadMode) {
                        filePickerOpened = false;
                        if (!fileInput.files || !fileInput.files.length) {
                            reset();
                        }
                    }
                }, 350);
            }
        });

        function screenPickedFiles(picked) {
            function notify(message) {
                if (typeof window.showLocalToast === "function") window.showLocalToast(message);
                else alert(message);
            }
            if (!window.LBInputGuard) {
                var strict = picked.filter(function (f) {
                    var type = String(f.type || "").toLowerCase();
                    return (type === "image/jpeg" || type === "image/png") && /\.(jpe?g|png)$/i.test(f.name || "");
                });
                if (strict.length < picked.length) notify("Please choose JPG or PNG photos.");
                return Promise.resolve(strict);
            }
            return window.LBInputGuard.filterImages(picked).then(function (screened) {
                if (screened.rejected.length) {
                    notify(screened.rejected.length === 1
                        ? screened.rejected[0].message
                        : screened.rejected.length + " files were skipped. " + screened.rejected[0].message);
                }
                return screened.accepted;
            });
        }

        fileInput.addEventListener("change", function (e) {
            filePickerOpened = false;
            if (!e.target.files || e.target.files.length === 0) {
                if (isUploadMode) reset();
                return;
            }
            const picked = Array.from(e.target.files);
            fileInput.value = "";
            screenPickedFiles(picked).then(function (files) {
            let fileIdx = 0;
            for (let i = activeIndex; i < requiredPhotos && fileIdx < files.length; i++) {
                if (!uploadedImages[i]) {
                    let file = null;
                    if (fileIdx < files.length) file = files[fileIdx++];
                    if (!file) break;

                    const indexToFill = i;

                    resizeImageForCanvas(file, 1200).then(function (dataUrl) {
                        if (isUsableImageDataUrl(dataUrl)) {
                            uploadedImages[indexToFill] = dataUrl;
                            renderSlots();
                            const allFilled = uploadedImages.filter(Boolean).length === requiredPhotos;
                            updateGenerateBtnState(allFilled);
                        } else {

                            console.warn("Resize produced invalid data for file:", file.name);
                            fallbackDirectRead(file, indexToFill);
                        }
                    }).catch(function (err) {
                        console.warn("Resize failed for file:", file.name, err);

                        if (err && err.message === "corrupted") {
                            fallbackDirectRead(file, indexToFill);
                        } else {

                            fallbackDirectRead(file, indexToFill);
                        }
                    });
                }
            }
            });
        });

        function fallbackDirectRead(file, indexToFill) {
            var reader = new FileReader();
            reader.onload = function (event) {
                if (isUsableImageDataUrl(event.target.result)) {
                    uploadedImages[indexToFill] = event.target.result;
                    renderSlots();
                    const allFilled = uploadedImages.filter(Boolean).length === requiredPhotos;
                    updateGenerateBtnState(allFilled);
                } else {
                    if (typeof window.showLocalToast === "function") window.showLocalToast("Failed to process image. Try a different file.");
                    else alert("Failed to process image. Try a different file.");
                }
            };
            reader.onerror = function () {
                if (typeof window.showLocalToast === "function") window.showLocalToast("Error reading file.");
                else alert("Error reading file.");
            };
            reader.readAsDataURL(file);
        }

        generateBtn.addEventListener("click", function (e) {
            if (!isUploadMode) return;
            e.preventDefault();
            e.stopPropagation();

            const validImages = uploadedImages.filter(img => img !== null);
            if (validImages.length < requiredPhotos) {
                const names = { 1: "1 photo", 2: "2 photos", 3: "3 photos", 4: "4 photos" };
                const msg = `Please upload ${names[requiredPhotos] || requiredPhotos + " photos"}`;
                if (typeof window.showLocalToast === "function") window.showLocalToast(msg);
                else alert(msg);
                return;
            }

            if (typeof window.showLoader === "function") window.showLoader("Generating...");

            const validatedImages = validImages.filter(isUsableImageDataUrl);
            if (validatedImages.length < requiredPhotos) {
                if (typeof window.hideLoader === "function") window.hideLoader();
                const msg = "Some images failed to process. Please try uploading again.";
                if (typeof window.showLocalToast === "function") window.showLocalToast(msg);
                else alert(msg);
                return;
            }

            const cameraFrame = document.getElementById("camera-frame");
            if (cameraFrame && typeof window.setCurrentStripFilter === "function") {
                const filterClass = Array.from(cameraFrame.classList).find(c => c.startsWith("filter-"));
                if (filterClass) window.setCurrentStripFilter(filterClass.replace("filter-", ""));
            }

            window._icCapturePhotos = validatedImages.slice();
            window._icPhotosReady = true;
            window._rawBlobUrls = validatedImages.slice();
            window._lbStripSlots = validatedImages.slice();

            setTimeout(() => {
                const forceOpen = window.__icForceOpen || window._icForceOpen || window.__icShowOutputScreen;
                if (typeof forceOpen === "function") {
                    try { window._icPreservePhotosOnBoot = false; } catch (e) {}
                    try { forceOpen("upload-flow"); } catch (e) {}
                }
                const icScreen = document.getElementById("ic-output-screen");
                const cameraSection = document.querySelector(".camera-section");
                if (icScreen) {
                    if (cameraSection) {
                        cameraSection.style.display = "none";
                        cameraSection.classList.remove("visible");
                    }
                    icScreen.style.display = "flex";
                    icScreen.classList.add("visible");
                    icScreen.style.visibility = "visible";
                    icScreen.style.opacity = "1";
                    icScreen.style.pointerEvents = "auto";
                    document.body.classList.add("ic-output-open");
                }
                if (typeof window.hideLoader === "function") window.hideLoader();
                window.dispatchEvent(new Event("resize"));
            }, 100);
        });

        const retakeBtn = document.getElementById("retake-btn");
        if (retakeBtn) retakeBtn.addEventListener("click", () => { if (isUploadMode) reset(); });
        const icRetakeBtn = document.getElementById("ic-retake-btn");
        if (icRetakeBtn) icRetakeBtn.addEventListener("click", () => { if (isUploadMode) reset(); });
        const icBackBtn = document.getElementById("ic-output-back-btn");
        if (icBackBtn) icBackBtn.addEventListener("click", () => { if (isUploadMode) reset(); });

        document.addEventListener("click", (e) => {
            const btn = e.target && e.target.closest && e.target.closest(
                "#retake-btn, #ic-retake-btn, .retake-btn, .ic-retake-btn, #preview-back-btn, .preview-back-btn, .ic-output-back-btn, .back-btn, #back-btn, #_rc_retake_now_btn, [data-action='retake'], [data-action='back']"
            );
            if (btn) {

                setTimeout(() => reset(), 50);
            }
        });

        let _wasOutputOpen = false;
        new MutationObserver(() => {
            const isOutputOpen = document.body.classList.contains("preview-visible") ||
                                 document.body.classList.contains("ic-output-open");
            if (_wasOutputOpen && !isOutputOpen && isUploadMode) {
                setTimeout(() => reset(), 50);
            }
            _wasOutputOpen = isOutputOpen;
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

        new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName === "class") {
                    if (document.body.classList.contains("lb-camera-counting")) {
                        addBtn.style.opacity = "0.5";
                        addBtn.style.pointerEvents = "none";
                    } else {
                        addBtn.style.opacity = "";
                        addBtn.style.pointerEvents = "";
                    }
                }
            });
        }).observe(document.body, { attributes: true });

        new MutationObserver(() => {
            if (document.querySelector(".camera-section.shared-layout")) {
                if (isUploadMode) reset();
                addBtn.style.display = "none";
            } else {
                addBtn.style.display = "";
            }
        }).observe(cameraSection || document.body, { attributes: true, attributeFilter: ["class"] });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
