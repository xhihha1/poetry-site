"""Write offline-songs.json: every songbook file with its size and a content hash.

apps/offline.html reads it to download whole books for offline use and to spot
songs that were added or changed since the last download. GitHub Pages has no
directory listing, so the list has to be generated; the deploy workflow runs this
before uploading. Run it by hand to test offline downloads locally:

    python3 tools/build_offline_index.py
"""
import hashlib
import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# book code -> (display name, image directory); keep in sync with index.html
BOOKS = [
    ('D', '大本詩歌', 'shi_ge'),
    ('B', '補充本詩歌', 'bu_chong_ben'),
    ('N', '新歌頌詠', 'xin_ge_song_yong'),
    ('X', '新詩(紅)', 'hong_ben'),
    ('L', '新詩(藍)', 'lan_ben'),
]


def entries(rel_dir, ext):
    folder = os.path.join(ROOT, rel_dir)
    if not os.path.isdir(folder):
        return []
    out = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(ext):
            continue
        path = os.path.join(folder, name)
        with open(path, 'rb') as f:
            digest = hashlib.sha1(f.read()).hexdigest()[:10]
        out.append([rel_dir + '/' + name, os.path.getsize(path), digest])
    return out


def main():
    books = []
    for code, name, folder in BOOKS:
        files = entries(folder, '.png') + entries('jianpu/' + code, '.json')
        books.append({'code': code, 'name': name, 'files': files})
    index = {'generated': int(time.time()), 'books': books}
    with open(os.path.join(ROOT, 'offline-songs.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    for b in books:
        print('%s %-6s %4d files %6.1f MB' % (b['code'], b['name'], len(b['files']),
                                             sum(x[1] for x in b['files']) / 1048576))


if __name__ == '__main__':
    main()
