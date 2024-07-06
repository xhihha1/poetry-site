let textToRead = '';
let topicFile = 'Matthew';
const topicList = [{
        name: '馬太福音',
        file: 'Matthew'
    },
    {
        name: '馬可福音',
        file: 'Mark'
    },
    {
        name: '路加福音',
        file: 'Luke'
    },
    {
        name: '約翰福音',
        file: 'John'
    },
    {
        name: '使徒行傳',
        file: 'Acts'
    },
    {
        name: '羅馬書',
        file: 'Romans'
    },
    {
        name: '哥林多前書',
        file: 'Corinthians1'
    },
    {
        name: '哥林多後書',
        file: 'Corinthians2'
    },
    {
        name: '加拉太書',
        file: 'Galatians'
    },
    {
        name: '以弗所書',
        file: 'Ephesians'
    },
    {
        name: '腓立比書',
        file: 'Philippians'
    },
    {
        name: '歌羅西書',
        file: 'Colossians'
    },
    {
        name: '帖撒羅尼迦前書',
        file: 'Thessalo1'
    },
    {
        name: '帖撒羅尼迦後書',
        file: 'Thessalo2'
    },
    {
        name: '提摩太前書',
        file: 'Timothy1'
    },
    {
        name: '提摩太後書',
        file: 'Timothy2'
    },
    {
        name: '提多書',
        file: 'Titus'
    },
    {
        name: '腓利門書',
        file: 'Philemon'
    },
    {
        name: '希伯來書',
        file: 'Hebrews'
    },
    {
        name: '雅各書',
        file: 'James'
    },
    {
        name: '彼得前書',
        file: 'Peter1'
    },
    {
        name: '彼得後書',
        file: 'Peter2'
    },
    {
        name: '約翰一書',
        file: 'John1'
    },
    {
        name: '約翰二書',
        file: 'John2'
    },
    {
        name: '約翰三書',
        file: 'John3'
    },
    {
        name: '猶大書',
        file: 'Jude'
    },
    {
        name: '啟示錄',
        file: 'Revelation'
    }
];
let speechSynthesisUtterance = null;

// 生成列表項目
function genList(items, ulId) {
    const ul = document.getElementById(ulId);
    if (!ul) {
        console.error(`元素id为"${ulId}"的<ul>未找到`);
        return;
    }
    ul.innerHTML = '';
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.name;
        li.addEventListener('click', () => {
            changTopic(item.file);
            const element = document.getElementById('readContral');
            element.style.visibility = 'visible';
        });
        ul.appendChild(li);
    });
}

// 更改主題並加載相應的Markdown文件
function changTopic(name) {
    topicFile = name;
    loadAndReadMarkdown();
}

// 加載並顯示Markdown文件
async function loadAndReadMarkdown() {
    try {
        const response = await fetch(`./bible/NewTestament/${topicFile}.md`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const markdown = await response.text();
        const contentDiv = document.getElementById('content');
        const parsedContent = marked.parse(markdown);

        // 将<p>标签内容用<div>标签分行
        const contentWithDivs = parsedContent.replace(/<p>(.*?)<\/p>/gs, (match, p1) => {
            const lines = p1.split('<br>').map(line => `<div class="line">${line.trim()}</div>`).join('');
            return `<p>${lines}</p>`;
        });

        contentDiv.innerHTML = contentWithDivs;

        // 提取全文內容
        textToRead = Array.from(contentDiv.querySelectorAll('.line')).map(line => line.textContent).join(' ');

        // 添加點擊事件
        const lines = contentDiv.querySelectorAll('.line');
        lines.forEach(line => {
            line.addEventListener('click', async (e) => {
                let nextLine = line;
                // e.target.classList.add('current');
                while (nextLine && nextLine.classList.contains('line')) {
                    lines.forEach(line => line.classList.remove('current'));
                    nextLine.classList.add('current');
                    await readLine(nextLine.textContent)
                    nextLine = nextLine.nextElementSibling;
                }
            });
        });
    } catch (error) {
        console.error('Error loading or reading Markdown file:', error);
        alert('加载或读取Markdown文件时出错，请检查文件路径和网络连接。');
    }
}

// 朗讀指定行
function readLine(text) {
    return new Promise((resolve) => {
        // scroll content
        const readPage = document.querySelector("#read-page");
        const currentLine = document.querySelector(".line.current");

        if (readPage && currentLine) {
            readPage.scrollTop = currentLine.offsetTop - readPage.offsetTop - 150;
        }
        // strat speech
        if (speechSynthesisUtterance) {
            window.speechSynthesis.cancel();
        }
        speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
        speechSynthesisUtterance.lang = 'zh-TW'; // 設置語言為中文
        speechSynthesisUtterance.onend = function (event) {
            resolve('朗讀完成');
        };
        window.speechSynthesis.speak(speechSynthesisUtterance);
    })
}

async function readAllLine() {
    const contentDiv = document.getElementById('content');
    const lines = contentDiv.querySelectorAll('.line');
    for (let i = 0; i < lines.length; i++) {
        // 移除所有行上的current类名
        lines.forEach(line => line.classList.remove('current'));
        const line = lines[i];
        // 为当前点击的行添加current类名
        line.classList.add('current');
        await readLine(line.textContent)
    }
    return false;
}


// 暫停朗讀
function pauseReading() {
    if (speechSynthesisUtterance) {
        window.speechSynthesis.pause();
    }
}

// 繼續朗讀
function resumeReading() {
    if (speechSynthesisUtterance) {
        window.speechSynthesis.resume();
    }
}

function adjustFontSize(amount) {
    const minFontSize = 14;
    const lines = readContentArea.querySelectorAll(".line");
    lines.forEach(line => {
        let currentFontSize = parseFloat(window.getComputedStyle(line).fontSize);
        let currentLineHeight = parseFloat(window.getComputedStyle(line).lineHeight);
        
        // Calculate new font size and line height
        let newFontSize = currentFontSize + amount;
        let newLineHeight = currentLineHeight + amount;

        // Ensure the font size doesn't go below the minimum
        if (newFontSize < minFontSize) {
            newFontSize = minFontSize;
            newLineHeight = currentLineHeight + (minFontSize - currentFontSize);
        }

        line.style.fontSize = newFontSize + "px";
        line.style.lineHeight = newLineHeight + "px";
    });
}

// 初始化列表
genList(topicList, 'topicNewTestament');


window.addEventListener('beforeunload', function() {
    if (speechSynthesisUtterance) {
        window.speechSynthesis.cancel();
    }
});