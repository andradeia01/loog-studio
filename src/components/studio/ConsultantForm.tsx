"use client";

import { Consultant } from "@/lib/types";
import { formatPhoneBR } from "@/lib/utils";

interface Props {
  value: Consultant;
  onChange: (next: Consultant) => void;
}

export function ConsultantForm({ value, onChange }: Props) {
  function patch<K extends keyof Consultant>(k: K, v: Consultant[K]) {
    onChange({ ...value, [k]: v });
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="label mb-1.5">Nome completo</label>
        <input
          className="input"
          type="text"
          autoComplete="name"
          value={value.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Ex.: João da Silva"
          maxLength={80}
        />
      </div>
      <div>
        <label className="label mb-1.5">Telefone</label>
        <input
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={value.phone}
          onChange={(e) => patch("phone", e.target.value)}
          onBlur={(e) => patch("phone", formatPhoneBR(e.target.value))}
          placeholder="(24) 99999-9999"
          maxLength={24}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1.5">Instagram <span className="ml-1 font-normal normal-case text-loog-muted/60">opcional</span></label>
          <input
            className="input"
            type="text"
            value={value.instagram ?? ""}
            onChange={(e) => patch("instagram", e.target.value)}
            placeholder="@seuhandle"
            maxLength={60}
          />
        </div>
        <div>
          <label className="label mb-1.5">Cidade <span className="ml-1 font-normal normal-case text-loog-muted/60">opcional</span></label>
          <input
            className="input"
            type="text"
            value={value.city ?? ""}
            onChange={(e) => patch("city", e.target.value)}
            placeholder="Volta Redonda"
            maxLength={80}
          />
        </div>
      </div>
    </div>
  );
}
