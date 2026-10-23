# Training data

`scripts/download_data.py` fetches the two sources that matter for HTTP payload
classification. Files are cached locally and never committed.

| Source | Path | Used for |
|---|---|---|
| [CSIC 2010 HTTP dataset](https://github.com/Monkey-D-Groot/Machine-Learning-on-CSIC-2010) | `csic2010/normalTrafficTraining.txt`, `csic2010/anomalousTrafficTest.txt` | Benign request realism (20 MB) and labelled attack traffic (16 MB) |
| [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) | `payloads/*.md` | XSS, SQLi, command-injection, traversal and LFI payload strings |
| Generated corpus | built into `scripts/dataset.py` | Balanced coverage of all six classes; keeps training reproducible offline |

## CSIC 2010 labelling

CSIC is a binary dataset (normal vs anomalous). The anomalous half is mapped to
the six-class taxonomy with deterministic signatures in
`scripts/dataset.py::label_csic_anomalies`. This is documented as a limitation in
`RESULTS.md` because the mapping overlaps with model features.

## CICIDS2017 (optional)

CICIDS2017 is flow-level network telemetry (packet counts, byte rates, flow
durations). It has no HTTP method/path/body text, so blending it into the request
classifier would mix incompatible feature spaces and hurt accuracy. The shipped
model therefore does not use it.

If you want it for the behavioural model, drop `*.csv` files in
`data/cicids2017/` and derive benign `request_rate` samples from the flow
`Flow Packets/s` column before fitting a separate anomaly detector. The current
Isolation Forest is trained on benign session vectors produced by the proxy
contract (`ip_change_count_5min`, `ua_change_count_5min`, `asn_changed`,
`request_rate`), which is the data the service actually receives at inference
time.

## Licensing

CSIC 2010 is published for research use by its authors. PayloadsAllTheThings is
MIT licensed. Keep the source URLs in `scripts/download_data.py` so the dataset
provenance stays auditable.
