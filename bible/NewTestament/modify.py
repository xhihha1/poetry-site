import re

def process_md_file(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as file:
        lines = file.readlines()
    
    processed_lines = []
    for line in lines:
        # 匹配以"數字:數字"開頭的行
        match = re.match(r'^\d+:\d+\s', line)
        if match:
            # 刪除開頭的"數字:數字"和行中的阿拉伯數字
            line = re.sub(r'^\d+:\d+\s', '', line)
            line = re.sub(r'\d', '', line)
            # 在行尾加上兩個空格
            line = line.rstrip() + '  \n'
        processed_lines.append(line)
    
    with open(output_file, 'w', encoding='utf-8') as file:
        file.writelines(processed_lines)

if __name__ == "__main__":
    input_file = 'Mark_o.md'  # 輸入的Markdown文件
    output_file = 'Mark.md'  # 輸出的處理後的Markdown文件
    process_md_file(input_file, output_file)