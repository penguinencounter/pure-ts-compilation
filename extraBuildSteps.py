with open('dist/worker.js') as f:
    d = f.read()
b = d.replace('import localforage from "localforage";', 'importScripts("localforage.js");')
with open('dist/worker.js', 'w') as f:
    f.write(b)

import shutil
shutil.rmtree('dist/static', ignore_errors=True)
shutil.copytree('static', 'dist/static')
