#!/usr/bin/env python3
"""Inspect published Indonesian Pocket ONNX file sizes without downloading weights."""
from huggingface_hub import HfApi
repo="anak10thn/pocket-tts-indonesian"
print("MODEL_REPO",repo,flush=True)
total=0
for file in HfApi().list_repo_tree(repo_id=repo,path_in_repo="onnx",recursive=True,expand=True):
    name=getattr(file,"path","")
    if name and getattr(file,"size",None) is not None:
        size=file.size
        total+=size
        print(f"ONNX_FILE {name} {size/1024/1024:.1f} MiB",flush=True)
print(f"ONNX_FILES_TOTAL {total/1024/1024:.1f} MiB",flush=True)
