import React from 'react';

interface ReferenceRoleCellProps {
  roleNames: string[];
  value: string;
  disabled?: boolean;
  onChange: (roleName: string) => void;
}

const ReferenceRoleCell: React.FC<ReferenceRoleCellProps> = ({ roleNames, value, disabled, onChange }) => {
  const hasRoles = roleNames.length > 0;

  return (
    <div className="flex items-start justify-start px-1 pt-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !hasRoles}
        className="w-full h-9 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
        title={!hasRoles ? '请先在页面顶部关联并扫描角色库文件夹' : value ? `参考角色: ${value}` : '请选择参考角色'}
      >
        <option value="">{hasRoles ? '选择参考角色' : '未关联角色库'}</option>
        {roleNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ReferenceRoleCell;

