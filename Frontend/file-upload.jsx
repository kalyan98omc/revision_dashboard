import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./file-upload.module.css";

/**
 * FileUpload Component
 * ─────────────────────
 * RAG-based document upload component for uploading PDFs and text files
 * to OpenAI's vector store for semantic search and retrieval.
 */

export default function FileUpload({ subjectId, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);
  const [description, setDescription] = useState("");
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const API_BASE = "http://localhost:5000/api/v1";

  // ─────────────────────────────────────────────────────────────────────────
  //  FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.add(styles.dragActive);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove(styles.dragActive);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove(styles.dragActive);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = (newFiles) => {
    const validFiles = newFiles.filter((file) => {
      const validTypes = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!validTypes.includes(file.type)) {
        setError(`${file.name}: Invalid file type. Allowed: PDF, TXT, MD, DOC, DOCX`);
        return false;
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setError(`${file.name}: File size exceeds 10MB limit`);
        return false;
      }

      return true;
    });

    setFiles((prev) => [...prev, ...validFiles]);
    setError(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  UPLOAD LOGIC
  // ─────────────────────────────────────────────────────────────────────────

  const uploadFiles = async () => {
    if (files.length === 0) {
      setError("No files selected");
      return;
    }

    setUploading(true);
    setError(null);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (subjectId) formData.append("subject_id", subjectId);
        if (description) formData.append("description", description);

        const token = localStorage.getItem("access_token");

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setUploadProgress((prev) => ({
              ...prev,
              [file.name]: percentComplete,
            }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 202 || xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            console.log("[FileUpload] Upload successful:", response);
            
            // Add to uploaded files immediately for instant feedback
            setUploadedFiles((prev) => [
              ...prev,
              {
                id: response.id,
                filename: response.filename,
                original_name: response.filename,
                status: response.status,
                page_count: null,
                file_size_bytes: 0,
                created_at: new Date().toISOString(),
              },
            ]);

            setFiles((prev) => prev.filter((f) => f.name !== file.name));
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[file.name];
              return newProgress;
            });

            if (onUploadComplete) onUploadComplete(response);
            
            // Refetch after short delay to get updated status from backend
            setTimeout(() => {
              console.log("[FileUpload] Refetching after upload...");
              fetchUploadedFiles();
            }, 1000);
          } else {
            const response = JSON.parse(xhr.responseText);
            console.error("[FileUpload] Upload error:", response);
            setError(`Upload failed for ${file.name}: ${response.error}`);
          }
        });

        xhr.addEventListener("error", () => {
          setError(`Upload failed for ${file.name}: Network error`);
        });

        xhr.open("POST", `${API_BASE}/documents`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      } catch (err) {
        setError(`Upload failed for ${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  FETCH UPLOADED FILES
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchUploadedFiles();
  }, [subjectId]); // Re-fetch when subject changes

  const fetchUploadedFiles = useCallback(async () => {
    try {
      const token = localStorage.getItem("access_token");
      const url = subjectId
        ? `${API_BASE}/documents?subject_id=${subjectId}`
        : `${API_BASE}/documents`;

      console.log("[FileUpload] Fetching documents from:", url);
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[FileUpload] Fetched documents:", data.documents);
        setUploadedFiles(data.documents || []);
      } else {
        console.error("[FileUpload] Fetch failed with status:", response.status);
      }
    } catch (err) {
      console.error("[FileUpload] Failed to fetch documents:", err);
    }
  }, [subjectId, API_BASE]);

  // ─────────────────────────────────────────────────────────────────────────
  //  DELETE FILE
  // ─────────────────────────────────────────────────────────────────────────

  const deleteFile = async (docId) => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setUploadedFiles((prev) => prev.filter((f) => f.id !== docId));
      } else {
        setError("Failed to delete file");
      }
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>📄 Upload Study Materials</h2>
      <p className={styles.subtitle}>
        Upload PDFs and text files for automatic vectorization and semantic search
      </p>

      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        className={styles.dropZone}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={styles.dropZoneContent}>
          <div className={styles.uploadIcon}>📤</div>
          <p className={styles.dropZoneText}>
            Drop PDFs / text files here or click to upload
          </p>
          <p className={styles.fileInfo}>
            Supported: PDF, TXT, MD, DOC, DOCX (Max 10MB each)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className={styles.fileInput}
          accept=".pdf,.txt,.md,.doc,.docx"
        />
      </div>

      {/* Description Input */}
      <div className={styles.descriptionSection}>
        <label htmlFor="description">File Description (Optional)</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description for this file..."
          className={styles.descriptionInput}
          maxLength={500}
        />
        <p className={styles.charCount}>{description.length}/500</p>
      </div>

      {/* Error Message */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Selected Files */}
      {files.length > 0 && (
        <div className={styles.selectedFiles}>
          <h3>📋 Selected Files ({files.length})</h3>
          <div className={styles.fileList}>
            {files.map((file, idx) => (
              <div key={idx} className={styles.fileItem}>
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>
                    {(file.size / 1024).toFixed(2)} KB
                  </span>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeFile(idx)}
                  disabled={uploading}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {Object.keys(uploadProgress).map((fileName) => (
        <div key={fileName} className={styles.progressContainer}>
          <p className={styles.progressLabel}>{fileName}</p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${uploadProgress[fileName]}%` }}
            />
          </div>
          <p className={styles.progressPercent}>
            {uploadProgress[fileName].toFixed(0)}%
          </p>
        </div>
      ))}

      {/* Upload Button */}
      {files.length > 0 && (
        <button
          className={styles.uploadBtn}
          onClick={uploadFiles}
          disabled={uploading}
        >
          {uploading ? "⏳ Uploading..." : "🚀 Upload Files"}
        </button>
      )}

      {/* Uploaded Files Table */}
      {uploadedFiles.length > 0 && (
        <div className={styles.uploadedSection}>
          <h3>✅ Uploaded Files</h3>
          <table className={styles.fileTable}>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Subject</th>
                <th>Pages</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploadedFiles.map((file) => (
                <tr key={file.id} className={styles[`status-${file.status}`]}>
                  <td className={styles.fileName}>📄 {file.filename}</td>
                  <td>{file.subject_id ? "Linked" : "General"}</td>
                  <td>{file.page_count || "-"}</td>
                  <td>{((file.file_size_bytes || 0) / (1024 * 1024)).toFixed(2)} MB</td>
                  <td>
                    {new Date(file.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={styles[`badge-${file.status}`]}>
                      {file.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => deleteFile(file.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
