"use client";

import * as Select from "@radix-ui/react-select";

export default function WorkspaceSelect({
  label,
  value,
  options,
  onChange,
  showLabel = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  showLabel?: boolean;
}) {
  return (
    <div className="hw-select">
      {showLabel && <span className="hw-select-label">{label}</span>}
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger className="hw-select-trigger" aria-label={label}>
          <Select.Value />
          <Select.Icon asChild>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m4 6 4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Content
          className="hw-select-menu"
          position="popper"
          sideOffset={5}
          collisionPadding={10}
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                className="hw-select-option"
                key={option}
                value={option}
              >
                <Select.ItemText>{option}</Select.ItemText>
                <Select.ItemIndicator>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="m3 8 3 3 7-7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Root>
    </div>
  );
}
