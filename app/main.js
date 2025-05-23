const net = require("net");
const { readFile, writeFile} = require("fs/promises");
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);

const EOF = '\r\n';
const headerText = {
        200: 'OK',
        201: 'Created',
        404: 'Not Found',
        500: 'Internal Server Error'
    }

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

class Response {

    constructor(statusCode = 200, headers = {}, content)
    {
        this.statusCode = statusCode;
        this.headers = headers;
        this.content = content;
    }

    send = (socket) => {
        socket.write(`HTTP/1.1 ${this.statusCode} ${headerText[this.statusCode]}${EOF}`);

        for (const [key, value] of Object.entries(this.headers)) {
            socket.write(`${key}: ${value} ${EOF}`);
        }
        socket.write(EOF);

        if(this.content)
            socket.write(this.content);

        if(this.headers['Connection'] && this.headers['Connection'] === 'close')
            socket.end();
    }

}

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {

    socket.on("data", async (data) => {
        const response = await handleConnection(data);

        response.send(socket);
    });
    
    socket.on("close", () => {
        socket.end();
    });

 });

 async function handleConnection (data) {
    const request = data.toString();

    const lines = request.split("\r\n");

    const [method, url, httpVersion] = lines[0].split(" ");

    const headers = {}
    for(let i = 1; lines.length; i++)
    {
        if(!lines[i] || lines[i].trim() === '')
            break;
        const [name , value] = lines[i].split(":");
        if(name && value)
            headers[name] = value.trim();
    }

    const body = lines[lines.length - 1];

    console.log(headers);

    const responseHeader = {};
    if(headers['Connection'] && headers['Connection'] === 'close')
        responseHeader['Connection'] = 'close';

    if(url === '/' || url === '/index.html')
        return new Response(200, responseHeader);
    else if(url.includes('/echo/'))
    {
        let content = url.substring(6, url.length);
        return await echoResponse(content, headers, responseHeader);
    }
    else if(url.includes('/user-agent'))
    {
        let content = headers['User-Agent'];
        responseHeader['Content-Type']= 'text/plain';
        responseHeader['Content-Length'] = content.length;
        
        return new Response(200, responseHeader, content);
    }
    else if(url.includes('/files/'))
    {
        let fileName = url.substring(7, url.length);
        if(method == 'GET')
            return await readFileResponse(fileName, responseHeader);
        else if(method == 'POST')
            return await writeFileResponse(fileName, body, responseHeader);
    }

    return new Response(404, responseHeader);
 }

 async function echoResponse(rawContent, headers, responseHeader)
 {
    let encoding = headers['Accept-Encoding'];
    if(encoding && encoding.includes('gzip'))
    {
        try {
            const compressedContent = await gzipAsync(rawContent);
            responseHeader['Content-Encoding'] = 'gzip';
            responseHeader['Content-Type'] = 'text/plain';
            responseHeader['Content-Length'] = compressedContent.length;
            return new Response(200, responseHeader, compressedContent);
        } 
        catch(err) {
            return new Response(500, responseHeader);
        }
    }
    else
    {
        responseHeader['Content-Type'] = 'text/plain';
        responseHeader['Content-Length'] = rawContent.length;
        return new Response(200, responseHeader, rawContent);
    }
}

async function readFileResponse(fileName, responseHeader)
{
    const dirIndex = process.argv.indexOf("--directory");
    const baseDirectory = dirIndex !== -1 ? process.argv[dirIndex + 1] : ".";

    let filePath = baseDirectory + fileName;

    try {
        const content = await readFile(filePath);
        responseHeader['Content-Type'] = 'application/octet-stream';
        responseHeader['Content-Length'] = content.length;
        return new Response(200, responseHeader, content);
    }
    catch(err) {
        return new Response(404, responseHeader);
    }
}

async function writeFileResponse(fileName, content, responseHeader)
{
    const dirIndex = process.argv.indexOf("--directory");
    const baseDirectory = dirIndex !== -1 ? process.argv[dirIndex + 1] : ".";

    let filePath = baseDirectory + fileName;

    try {
        await writeFile(filePath, content, 'utf-8');
        return new Response(201, responseHeader);
    }
    catch(err) {
        return new Response(404, responseHeader);
    }
}

 server.listen(4221, "localhost");
