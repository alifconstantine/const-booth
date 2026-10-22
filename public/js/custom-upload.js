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
        const addPhotosBtn = document.getElementById("desktop-add-photos");
        const fileInput = document.getElementById("native-photo-upload");
        const nativeStripPreview = document.getElementById("strip-preview");

        if (!originalCaptureBtn || !addPhotosBtn || !fileInput || !nativeStripPreview) {
            console.error("custom-upload.js: Missing required DOM elements");
            return;
        }

        let customStripPreview = document.getElementById("custom-strip-preview");
        if (!customStripPreview) {
            customStripPreview = document.createElement("div");
            customStripPreview.id = "custom-strip-preview";
            customStripPreview.className = "custom-upload-strip-preview";
            nativeStripPreview.parentNode.insertBefore(customStripPreview, nativeStripPreview.nextSibling);
        }

        const generateBtn = originalCaptureBtn.cloneNode(true);
        generateBtn.id = "custom-generate-btn";
        generateBtn.style.display = "none";
        originalCaptureBtn.parentNode.insertBefore(generateBtn, originalCaptureBtn.nextSibling);

        const btnMain = generateBtn.querySelector(".btn-main");

        let isUploadMode = false;
        let uploadedImages = [];
        let requiredPhotos = 3;
        let activeUploadIndex = null;

        function getRequiredPhotos() {
            const layout = localStorage.getItem("cardLayout") || "classic";
            const layoutPhotoCounts = {
                "classic": 3, "modern": 3, "film": 3, "polaroid": 3,
                "kitty": 4, "cherry": 4, "love": 4, "grid": 4, "2x2": 4
            };
            return layoutPhotoCounts[layout] || 3;
        }

        function updateGenerateBtnState(allFilled) {
            generateBtn.style.display = "flex";
            originalCaptureBtn.style.display = "none";

            if (btnMain) {
                const validImageCount = uploadedImages.filter(isUsableImageDataUrl).length;
                const trulyAllFilled = validImageCount === getRequiredPhotos();

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
                btnMain.innerHTML = `<span class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span><span>Generate Strip</span>`;
            }
        }

        function restoreOriginalCaptureBtn() {
            generateBtn.style.display = "none";
            generateBtn.style.setProperty("display", "none", "important");
            originalCaptureBtn.style.display = "";
            originalCaptureBtn.style.removeProperty("display");
        }

        function renderPlaceholders() {
            customStripPreview.innerHTML = "";
            const total = getRequiredPhotos();

            for (let i = 0; i < total; i++) {
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
                    num.textContent = i + 1;
                    box.appendChild(num);
                }

                box.addEventListener("click", () => {
                    if (!isUploadMode) return;
                    if (uploadedImages[i]) {
                        uploadedImages[i] = null;
                        renderPlaceholders();
                        const allFilled = uploadedImages.filter(Boolean).length === getRequiredPhotos();
                        updateGenerateBtnState(allFilled);
                    } else {
                        activeUploadIndex = i;
                        fileInput.click();
                    }
                });

                customStripPreview.appendChild(box);
            }
        }

        function resetUploadMode() {
            isUploadMode = false;
            uploadedImages = [];
            activeUploadIndex = null;

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

            if (addPhotosBtn) {
                addPhotosBtn.classList.remove("upload-active");
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

            if (typeof window.__lbClearPhotoArrays === "function") {
                window.__lbClearPhotoArrays("retake");
            }

            window.dispatchEvent(new Event("resize"));
        }

        let filePickerOpened = false;

        addPhotosBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (document.querySelector(".camera-section.shared-layout")) return;

            if (document.body.classList.contains("is-capturing") || window._isCapturing) return;

            if (!isUploadMode) {
                isUploadMode = true;
                requiredPhotos = getRequiredPhotos();
                uploadedImages = new Array(requiredPhotos).fill(null);

                if (cameraSection) {
                    cameraSection.classList.add("custom-upload-active");
                }

                updateGenerateBtnState(false);

                nativeStripPreview.style.display = "none";
                customStripPreview.removeAttribute("style");
                customStripPreview.classList.add("upload-mode-active");
                renderPlaceholders();

                activeUploadIndex = 0;
                filePickerOpened = true;
                fileInput.click();
            } else {
                const emptyIndex = uploadedImages.indexOf(null);
                if (emptyIndex !== -1) {
                    activeUploadIndex = emptyIndex;
                    filePickerOpened = true;
                    fileInput.click();
                }
            }
        });

        fileInput.addEventListener("cancel", () => {
            filePickerOpened = false;
            if (isUploadMode) resetUploadMode();
        });

        window.addEventListener("focus", () => {
            if (filePickerOpened) {
                setTimeout(() => {
                    if (filePickerOpened && isUploadMode) {
                        filePickerOpened = false;
                        if (!fileInput.files || !fileInput.files.length) {
                            resetUploadMode();
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

        fileInput.addEventListener("change", (e) => {
            filePickerOpened = false;
            if (!e.target.files || !e.target.files.length) {
                if (isUploadMode) resetUploadMode();
                return;
            }
            const picked = Array.from(e.target.files);
            fileInput.value = "";
            screenPickedFiles(picked).then(function (files) {
            let fileIndex = 0;
            for (let i = activeUploadIndex; i < requiredPhotos && fileIndex < files.length; i++) {
                if (!uploadedImages[i]) {
                    let file = null;
                    if (fileIndex < files.length) file = files[fileIndex++];
                    if (!file) break;

                    const indexToFill = i;

                    resizeImageForCanvas(file, 1200).then(function (dataUrl) {
                        if (isUsableImageDataUrl(dataUrl)) {
                            uploadedImages[indexToFill] = dataUrl;
                            renderPlaceholders();
                            const allFilled = uploadedImages.filter(Boolean).length === requiredPhotos;
                            updateGenerateBtnState(allFilled);
                        } else {

                            console.warn("Resize produced invalid data for file:", file.name);
                            fallbackDirectRead(file, indexToFill);
                        }
                    }).catch(function (err) {
                        console.warn("Resize failed for file:", file.name, err);

                        fallbackDirectRead(file, indexToFill);
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
                    renderPlaceholders();
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

        generateBtn.addEventListener("click", (e) => {
            if (!isUploadMode) return;
            e.preventDefault();
            e.stopPropagation();

            const validImages = uploadedImages.filter(img => img !== null);
            const validatedImages = validImages.filter(isUsableImageDataUrl);
            if (validatedImages.length < requiredPhotos) {
                if (typeof window.hideLoader === "function") window.hideLoader();
                if (typeof window.showLocalToast === "function") window.showLocalToast("Some images failed to process. Please try uploading again.");
                else alert("Some images failed to process. Please try uploading again.");
                return;
            }

            if (typeof window.showLoader === "function") window.showLoader("Generating...");

            const cameraFrame = document.getElementById("camera-frame");
            if (cameraFrame && typeof window.setCurrentStripFilter === "function") {
                const filterClass = Array.from(cameraFrame.classList).find(c => c.startsWith("filter-"));
                if (filterClass) {
                    const filterName = filterClass.replace("filter-", "");
                    window.setCurrentStripFilter(filterName);
                    const outputFilters = document.querySelectorAll("#output-filter-scroll .filter");
                    if (outputFilters.length > 0) {
                        outputFilters.forEach(el => el.classList.remove("active"));
                        const activePill = document.querySelector(`#output-filter-scroll .filter[data-filter="${filterName}"]`);
                        if (activePill) activePill.classList.add("active");
                    }
                }
            }

            const outputMode = localStorage.getItem("outputMode");

            if (outputMode === "card") {
                window._icCapturePhotos = validatedImages.slice();
                window._icPhotosReady = true;
                window._rawBlobUrls = validatedImages.slice();
                setTimeout(() => {
                    if (typeof window.__icShowOutputScreen === "function") window.__icShowOutputScreen("upload-flow");
                    if (typeof window.hideLoader === "function") window.hideLoader();
                }, 100);
            } else {
                window._lbStripSlots = validatedImages.slice();
                window._rawBlobUrls = validatedImages.slice();
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        const cameraSection = document.querySelector(".camera-section");
                        const previewScreen = document.querySelector(".preview-screen");
                        if (cameraSection) { cameraSection.style.display = ""; cameraSection.classList.remove("visible"); }
                        if (previewScreen) {
                            previewScreen.style.display = "flex";
                            previewScreen.classList.add("visible");
                            previewScreen.style.visibility = "visible";
                            previewScreen.style.opacity = "1";
                            previewScreen.style.pointerEvents = "auto";
                        }
                        document.body.classList.add("preview-visible");
                        window._lbOutputSession = Date.now();
                        window.dispatchEvent(new Event("resize"));
                        const activeLayout = document.querySelector(".layout.active") || document.querySelector(".layout");
                        if (activeLayout) activeLayout.click();
                        if (typeof window.hideLoader === "function") window.hideLoader();
                    });
                }, 100);
            }
        });

        document.addEventListener("click", (e) => {
            const btn = e.target && e.target.closest && e.target.closest(
                "#retake-btn, #ic-retake-btn, .retake-btn, .ic-retake-btn, #preview-back-btn, .preview-back-btn, .ic-output-back-btn, .back-btn, #back-btn, #_rc_retake_now_btn, [data-action='retake'], [data-action='back']"
            );
            if (btn) {

                setTimeout(() => requestAnimationFrame(() => resetUploadMode()), 50);
            }
        });

        let _wasOutputOpen = false;
        new MutationObserver(() => {
            const isOutputOpen = document.body.classList.contains("preview-visible") ||
                                 document.body.classList.contains("ic-output-open");
            if (_wasOutputOpen && !isOutputOpen && isUploadMode) {
                setTimeout(() => requestAnimationFrame(() => resetUploadMode()), 50);
            }
            _wasOutputOpen = isOutputOpen;
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

        new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName === "class") {
                    if (document.body.classList.contains("lb-camera-counting")) {
                        addPhotosBtn.style.opacity = "0.5";
                        addPhotosBtn.style.pointerEvents = "none";
                    } else {
                        addPhotosBtn.style.opacity = "";
                        addPhotosBtn.style.pointerEvents = "";
                    }
                }
            });
        }).observe(document.body, { attributes: true });

        new MutationObserver(() => {
            if (document.querySelector(".camera-section.shared-layout")) {
                if (isUploadMode) resetUploadMode();
                addPhotosBtn.style.display = "none";
            } else {
                addPhotosBtn.style.display = "";
            }
        }).observe(cameraSection || document.body, { attributes: true, attributeFilter: ["class"] });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
