from flask import Flask
app = Flask(__name__, static_folder="./dist/", static_url_path="/pure-ts-compilation/")
ghp_compat = True

@app.after_request
def after_request(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    if ghp_compat:
        if 'Content-Encoding' in response.headers and response.headers['Content-Encoding'] == 'gzip':
            response.headers.remove("Content-Encoding")
            response.headers["Content-Type"] = "application/gzip"
    return response

app.run(port=8000, host="0.0.0.0", debug=True)
