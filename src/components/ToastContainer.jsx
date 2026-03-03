import React from "react";

const typeStyles = {
  error: { borderLeft: "4px solid #ff6b6b" },
  success: { borderLeft: "4px solid #2ecc71" },
  info: { borderLeft: "4px solid #00b4d8" },
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts?.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-item"
          style={typeStyles[toast.type] || typeStyles.info}
        >
          <span>{toast.message}</span>
          <button
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
