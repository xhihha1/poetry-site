import os

def rename_files(start_page, start_number, end_page, directory):
    current_page = start_page
    current_number = start_number
    
    total_pages = end_page - start_page + 1
    end_number = start_number + total_pages - 1
    
    while current_page <= end_page:
        old_name = f"D_{current_page}.png"
        new_name = f"D_{current_number:03}.png"
        
        old_path = os.path.join(directory, old_name)
        new_path = os.path.join(directory, new_name)
        
        if os.path.exists(old_path):
            os.rename(old_path, new_path)
            print(f"Renamed: {old_path} to {new_path}")
        else:
            print(f"File not found: {old_path}")
        
        current_page += 1
        current_number += 1

# Example usage:
directory = ''
start_page = 760
start_number = 759
end_page = 788

rename_files(start_page, start_number, end_page, directory)