'use client';

interface ExportButtonProps {
  disabled?: boolean;
}

export default function ExportButton({ disabled = false }: ExportButtonProps) {
  const handleExport = () => {
    if (disabled) return;
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      导出报表
    </button>
  );
}
