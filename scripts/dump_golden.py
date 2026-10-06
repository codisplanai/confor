"""
Gera tests/golden.json a partir do script Python original (fonte da verdade).
Uso (na raiz do projeto):  python webapp/scripts/dump_golden.py
"""
import json
import os
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

import pdfplumber  # noqa: E402
from conciliacao_fornecedores import (  # noqa: E402
    parse_balancete,
    parse_conta_corrente,
    diagnosticar_divergencia,
)

PDF_BAL = os.path.join(RAIZ, "Amostras", "BALANCO0093-0108A3108DE2026JULIANA.PDF")
PDF_CC = os.path.join(RAIZ, "Amostras", "cprccforn.pdf")


def linhas(path):
    out = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            out.append([l.strip() for l in text.split("\n") if l.strip()])
    return out


bal, tot_bal = parse_balancete(PDF_BAL)
cc, tot_cc = parse_conta_corrente(PDF_CC)

grupos = {"batimentos": [], "divergencias": [], "somenteBalCred": [],
          "somenteBalSemCred": [], "somenteCC": []}
diag = {}
for cod in sorted(set(bal) | set(cc)):
    in_cc, in_bal = cod in cc, cod in bal
    if in_cc and in_bal:
        diff = round(bal[cod]["mov_credito"] - cc[cod]["saldo_credor"], 2)
        if abs(diff) < 0.01:
            grupos["batimentos"].append(cod)
        else:
            grupos["divergencias"].append(cod)
            d, cat = diagnosticar_divergencia(bal[cod], cc[cod]["saldo_credor"])
            diag[cod] = {"texto": d, "categoria": cat}
    elif in_bal:
        key = "somenteBalCred" if bal[cod]["mov_credito"] > 0 else "somenteBalSemCred"
        grupos[key].append(cod)
    else:
        grupos["somenteCC"].append(cod)

golden = {
    "linhasBalancete": linhas(PDF_BAL),
    "linhasContaCorrente": linhas(PDF_CC),
    "balancete": {
        k: {
            "nome": v["nome"], "classif": v["classif"],
            "saldoInicial": v["saldo_inicial"], "movDebito": v["mov_debito"],
            "movCredito": v["mov_credito"], "saldoFinal": v["saldo_final"],
        }
        for k, v in bal.items()
    },
    "totaisBalancete": tot_bal,
    "contaCorrente": {
        k: {"cnpj": v["cnpj"], "nome": v["nome"],
            "saldoCredor": round(v["saldo_credor"], 2), "ocorrencias": len(v["entries"])}
        for k, v in cc.items()
    },
    "totalContaCorrente": tot_cc,
    "grupos": grupos,
    "diagnosticos": diag,
}

saida = os.path.join(RAIZ, "webapp", "tests", "golden.json")
os.makedirs(os.path.dirname(saida), exist_ok=True)
with open(saida, "w", encoding="utf-8") as f:
    json.dump(golden, f, ensure_ascii=False, indent=1)

print("golden.json gerado:", saida)
print({k: len(v) for k, v in grupos.items()})
